const { ethers } = require("ethers");
const crypto = require("crypto");
require("dotenv").config();

// Contract addresses
const interchainTokenServiceContractAddress = process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS; // Axelar Interchain Token Service
const baseRandomDEXTokenAddress = process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS; // Base contract address
const ethRandomDEXTokenAddress = process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS; // Ethereum contract address

const interchainTokenServiceContractABI = require("../utils/interchainTokenServiceABI.json");
const { getSigner, getContractInstance, handleError } = require("../utils/helpers");

// Constants for TokenManagerType
const TOKEN_MANAGER_TYPE = {
  LOCK_UNLOCK: 0,
  MINT_BURN: 1,
  LIQUIDITY_POOL: 2,
};

async function deployTokenManagerBase() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const salt = "0x" + crypto.randomBytes(32).toString("hex");
    
    // Convert minter address to bytes
    const minter = ethers.zeroPadValue(await signer.getAddress(), 32);

    const deployTx = await interchainTokenServiceContract.deployTokenManager(
      salt,
      TOKEN_MANAGER_TYPE.LOCK_UNLOCK,
      ethers.AbiCoder.encode(
        ["address", "address"],
        [await signer.getAddress(), baseRandomDEXTokenAddress]
      ),
      { value: ethers.parseEther("0.01") }
    );

    console.log("Deploy Transaction Hash:", deployTx.hash);

    const tokenId = await interchainTokenServiceContract.interchainTokenId(signer.address, salt);
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager successfully deployed on Base:
      Salt: ${salt},
      Token ID: ${tokenId},
      Token Manager Address: ${tokenManagerAddress}
    `);

    return { salt, tokenId, tokenManagerAddress };
  } catch (error) {
    handleError("Error deploying Token Manager on Base", error);
  }
}

async function deployTokenManagerEthereum() {
  try {
    const signer = await getSigner(process.env.ETH_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const salt = "0x" + crypto.randomBytes(32).toString("hex");

    const deployTx = await interchainTokenServiceContract.deployTokenManager(
      salt,
      TOKEN_MANAGER_TYPE.LOCK_UNLOCK,
      ethers.AbiCoder.encode(
        ["address", "address"],
        [await signer.getAddress(), ethRandomDEXTokenAddress]
      ),
      { value: ethers.parseEther("0.01") }
    );

    console.log("Deploy Transaction Hash:", deployTx.hash);

    const tokenId = await interchainTokenServiceContract.interchainTokenId(signer.address, salt);
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager successfully deployed on Ethereum:
      Salt: ${salt},
      Token ID: ${tokenId},
      Token Manager Address: ${tokenManagerAddress}
    `);

    return { salt, tokenId, tokenManagerAddress };
  } catch (error) {
    handleError("Error deploying Token Manager on Ethereum", error);
  }
}

async function bridgeTokens(amount, fromChain, toChain) {
  try {
    const signer = await getSigner(
      fromChain === "base" ? process.env.BASE_SEPOLIA_RPC_URL : process.env.ETH_SEPOLIA_RPC_URL,
      process.env.PRIVATE_KEY
    );

    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const destinationChain = fromChain === "base" ? "ethereum-2" : "base";
    const tokenId = process.env.UPDATED_TOKEN_ID;
    const destinationAddress = ethers.zeroPadValue(await signer.getAddress(), 32);

    const interchainTransferTx = await interchainTokenServiceContract.interchainTransfer(
      tokenId,
      destinationChain,
      destinationAddress,
      amount,
      "0x",
      ethers.parseEther("0.01"),
      { gasLimit: 500000 }
    );

    console.log(`
      Bridging tokens from ${fromChain} to ${toChain}:
      Transaction Hash: ${interchainTransferTx.hash}
      Amount: ${amount}
      Token ID: ${tokenId}
      Destination Address: ${destinationAddress}
    `);

    return interchainTransferTx;
  } catch (error) {
    handleError("Error bridging tokens", error);
  }
}

module.exports = {
  deployTokenManagerBase,
  deployTokenManagerEthereum,
  bridgeTokens,
};
