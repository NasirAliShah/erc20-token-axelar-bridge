const { ethers } = require("ethers");
const crypto = require("crypto");
require("dotenv").config();

// Contract addresses
const interchainTokenServiceContractAddress = process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS; // Axelar Interchain Token Service
const baseRandomDEXTokenAddress = process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS; // Base contract address
const ethRandomDEXTokenAddress = process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS; // Ethereum contract address

// Utility to create a signer instance
async function getSigner(rpcUrl, privateKey) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}


async function deployTokenManagerBase() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = new ethers.Contract(
      process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS,
      require("../utils/interchainTokenServiceABI.json"),
      signer
    );

    const salt = "0x" + crypto.randomBytes(32).toString("hex");

    // Create params for token manager deployment
    const deployTx = await interchainTokenServiceContract.deployTokenManager(
      salt,
      2, // LOCK_UNLOCK type
      ethers.AbiCoder.encode(
        ["address", "address"],
        [await signer.getAddress(), process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS]
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
  } catch (error) {
    console.error("Error deploying Token Manager on Base:", error);
  }
}

async function deployTokenManagerEthereum() {
  try {
    const signer = await getSigner(process.env.ETH_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = new ethers.Contract(
      process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS,
      require("../utils/interchainTokenServiceABI.json"),
      signer
    );

    const salt = "0x" + crypto.randomBytes(32).toString("hex");

    const deployTx = await interchainTokenServiceContract.deployTokenManager(
      salt,
      2, // LOCK_UNLOCK type
      ethers.AbiCoder.encode(
        ["address", "address"],
        [await signer.getAddress(), process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS]
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
  } catch (error) {
    console.error("Error deploying Token Manager on Ethereum:", error);
  }
}

async function bridgeTokens(amount, fromChain, toChain) {
  try {
    const rpcUrl = fromChain === "base" ? process.env.BASE_SEPOLIA_RPC_URL : process.env.ETH_SEPOLIA_RPC_URL;
    const signer = await getSigner(rpcUrl, process.env.PRIVATE_KEY);
    
    const interchainTokenServiceContract = new ethers.Contract(
      process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS,
      require("../utils/interchainTokenServiceABI.json"),
      signer
    );

    const destinationChain = fromChain === "base" ? "ethereum-2" : "base";
    const destinationAddress = ethers.zeroPadValue(await signer.getAddress(), 32);

    const interchainTransferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.UPDATED_TOKEN_ID,
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
      Token ID: ${process.env.UPDATED_TOKEN_ID}
      Destination Address: ${destinationAddress}
    `);
  } catch (error) {
    console.error("Error bridging tokens:", error);
  }
}

module.exports = {
  deployTokenManagerBase,
  deployTokenManagerEthereum,
  bridgeTokens,
};
