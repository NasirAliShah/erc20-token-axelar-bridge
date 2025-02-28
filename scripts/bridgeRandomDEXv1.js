// Import dependencies
const { ethers } = require("hardhat");
const crypto = require("crypto");
const {
  AxelarQueryAPI,
  Environment,
  EvmChain,
  GasToken,
  AxelarGMPRecoveryAPI,
} = require("@axelar-network/axelarjs-sdk");

// Load environment variables
require("dotenv").config();

// ABIs for the contracts
const interchainTokenServiceContractABI = require("../utils/interchainTokenServiceABIN.json");
const baseRandomDEXTokenABI = require("../utils/RandomDEXABI.json");
const ethRandomDEXTokenABI = require("../utils/EthRandomDEXABI.json");

// Constants
const MINT_BURN = 4;
const LOCK_UNLOCK = 2;

// Contract addresses
const interchainTokenServiceContractAddress = process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS;
const baseRandomDEXTokenAddress = process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS;
const ethRandomDEXTokenAddress = process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS;

// Initialize Axelar APIs
const api = new AxelarQueryAPI({ environment: Environment.TESTNET });
const gmpRecoveryApi = new AxelarGMPRecoveryAPI({ environment: Environment.TESTNET });

// Utility to create a signer instance
async function getSigner(rpcUrl, privateKey) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Wallet(privateKey, provider);
}

// Utility to create a contract instance
async function getContractInstance(contractAddress, contractABI, signer) {
  return new ethers.Contract(contractAddress, contractABI, signer);
}

// Updated gas estimator with recovery API
async function gasEstimator(sourceChain, destinationChain, tokenSymbol = "ETH") {
  try {
    const gas = await api.estimateGasFee(
      sourceChain,
      destinationChain,
      tokenSymbol,
      1000000, // Increased gas limit for new protocol
      1.2      // Higher multiplier for better success rate
    );

    // Add buffer for token transfers
    return ethers.parseEther((Number(ethers.formatEther(gas)) * 1.2).toString());
  } catch (error) {
    handleError("Error estimating gas", error);
    throw error;
  }
}

// Deploy token manager for Base blockchain with new SDK features
async function deployTokenManagerBase() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    // Step 1: Register token metadata with new error handling
    const registerMetadataTx = await interchainTokenServiceContract.registerTokenMetadata(
      baseRandomDEXTokenAddress,
      ethers.parseEther("0.01"),
      { value: ethers.parseEther("0.01") }
    );
    
    console.log("Register Metadata Transaction Hash:", registerMetadataTx.hash);
    const registerReceipt = await registerMetadataTx.wait();
    
    // Monitor transaction status using GMP Recovery API
    const registerStatus = await gmpRecoveryApi.queryTransactionStatus(registerReceipt.hash);
    console.log("Register Metadata Status:", registerStatus);

    // Step 2: Generate salt and register custom token
    const salt = "0x" + crypto.randomBytes(32).toString("hex");
    const abiCoder = new ethers.AbiCoder();
    const params = abiCoder.encode(
      ["address", "address"],
      [await signer.getAddress(), baseRandomDEXTokenAddress]
    );

    const gasAmount = await gasEstimator(
      EvmChain.BASE_SEPOLIA,
      EvmChain.SEPOLIA,
      GasToken.ETH
    );

    const registerTx = await interchainTokenServiceContract.registerCustomToken(
      salt,
      baseRandomDEXTokenAddress,
      LOCK_UNLOCK,
      params,
      { value: gasAmount }
    );

    console.log("Register Custom Token Transaction Hash:", registerTx.hash);
    const registerCustomReceipt = await registerTx.wait();
    
    // Monitor custom token registration status
    const customTokenStatus = await gmpRecoveryApi.queryTransactionStatus(registerCustomReceipt.hash);
    console.log("Register Custom Token Status:", customTokenStatus);

    const tokenId = await interchainTokenServiceContract.interchainTokenId(signer.address, salt);
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    // Store the token ID and salt for later use
    process.env.TOKEN_ID = tokenId;
    process.env.TOKEN_SALT = salt;

    console.log(`
      Token Manager successfully deployed on Base:
      Salt: ${salt}
      Token ID: ${tokenId}
      Token Manager Address: ${tokenManagerAddress}
    `);

    return { tokenId, salt, tokenManagerAddress };
  } catch (error) {
    if (error.message.includes("ExecuteWithTokenNotSupported")) {
      console.error("Error: Token execution not supported. Please verify token configuration.");
    } else if (error.message.includes("GatewayToken")) {
      console.error("Error: Invalid gateway token. Please check token address.");
    } else {
      handleError("Error deploying Token Manager on Base", error);
    }
    throw error;
  }
}

// Deploy token manager for Ethereum blockchain
async function deployRemoteTokenManager() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    // Step 1: Link the token across chains
    const abiCoder = new ethers.AbiCoder();
    const linkParams = abiCoder.encode(
      ["address", "address"],
      [await signer.getAddress(), ethRandomDEXTokenAddress]
    );

    const gasAmount = await gasEstimator(
      EvmChain.BASE_SEPOLIA,
      EvmChain.SEPOLIA,
      GasToken.ETH
    );

    const linkTx = await interchainTokenServiceContract.linkToken(
      process.env.TOKEN_SALT,
      "ethereum-sepolia",
      ethers.zeroPadValue(ethRandomDEXTokenAddress, 32),
      MINT_BURN,
      linkParams,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Link Token Transaction Hash:", linkTx.hash);
    const linkReceipt = await linkTx.wait();

    // Monitor linking status
    const linkStatus = await gmpRecoveryApi.queryTransactionStatus(linkReceipt.hash);
    console.log("Link Token Status:", linkStatus);

    const tokenId = await interchainTokenServiceContract.interchainTokenId(
      signer.address,
      process.env.TOKEN_SALT
    );
    const tokenManagerAddress = await interchainTokenServiceContract.tokenManagerAddress(tokenId);

    console.log(`
      Token Manager successfully deployed on Ethereum:
      Token ID: ${tokenId}
      Token Manager Address: ${tokenManagerAddress}
    `);

    return { tokenId, tokenManagerAddress };
  } catch (error) {
    handleError("Error deploying Token Manager on Ethereum", error);
    throw error;
  }
}

// Grant mint/burn access on Ethereum
async function transferMintAccessToTokenManagerOnEth(tokenManagerAddress) {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEY);
    const tokenContract = await getContractInstance(
      ethRandomDEXTokenAddress,
      ethRandomDEXTokenABI,
      signer
    );

    // Grant MINT_ROLE
    const minterRole = await tokenContract.MINT_ROLE();
    console.log("Granting MINT_ROLE to token manager:", tokenManagerAddress);
    const grantMinterTx = await tokenContract.grantRole(minterRole, tokenManagerAddress);
    console.log("Grant Minter Role Transaction Hash:", grantMinterTx.hash);
    await grantMinterTx.wait();

    // Grant BURN_ROLE
    const burnRole = await tokenContract.BURN_ROLE();
    console.log("Granting BURN_ROLE to token manager:", tokenManagerAddress);
    const grantBurnTx = await tokenContract.grantRole(burnRole, tokenManagerAddress);
    console.log("Grant Burn Role Transaction Hash:", grantBurnTx.hash);
    await grantBurnTx.wait();

    console.log("Successfully granted MINT_ROLE and BURN_ROLE to token manager");
  } catch (error) {
    handleError("Error granting roles to token manager on Ethereum", error);
    throw error;
  }
}

// Approve tokens for transfer on Base
async function approveTokensOnBase(tokenManagerAddress) {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const tokenContract = await getContractInstance(
      baseRandomDEXTokenAddress,
      baseRandomDEXTokenABI,
      signer
    );

    // Approve maximum amount
    const maxAmount = ethers.MaxUint256;
    console.log("Approving tokens for token manager:", tokenManagerAddress);
    
    const approveTx = await tokenContract.approve(tokenManagerAddress, maxAmount);
    console.log("Approve Transaction Hash:", approveTx.hash);
    await approveTx.wait();

    console.log("Successfully approved tokens for token manager");
  } catch (error) {
    handleError("Error approving tokens on Base", error);
    throw error;
  }
}

// Transfer tokens with improved monitoring
async function transferTokensBaseToEth(amount) {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const gasAmount = await gasEstimator(
      EvmChain.BASE_SEPOLIA,
      EvmChain.SEPOLIA,
      GasToken.ETH
    );
    
    const destinationAddress = ethers.zeroPadValue(await signer.getAddress(), 32);
    const metadata = "0x"; // Empty metadata for simple transfer

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "ethereum-sepolia",
      destinationAddress,
      amount,
      metadata,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
    const receipt = await transferTx.wait();

    // Monitor transfer status using GMP Recovery API
    const transferStatus = await gmpRecoveryApi.queryTransactionStatus(receipt.hash);
    console.log("Transfer Status:", transferStatus);

    // If transfer is pending, set up monitoring
    if (transferStatus === 'pending') {
      console.log("Transfer pending. Setting up monitoring...");
      const monitor = setInterval(async () => {
        const status = await gmpRecoveryApi.queryTransactionStatus(receipt.hash);
        console.log(`Current transfer status: ${status}`);
        if (status !== 'pending') {
          clearInterval(monitor);
          console.log("Transfer completed with status:", status);
        }
      }, 30000); // Check every 30 seconds
    }

    console.log(`Successfully initiated transfer of ${amount} tokens from Base to Ethereum`);
    return receipt.hash;
  } catch (error) {
    handleError("Error transferring tokens from Base to Ethereum", error);
    throw error;
  }
}

// Transfer tokens from Ethereum to Base
async function transferTokensEthToBase(amount) {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const gasAmount = await gasEstimator(
      EvmChain.SEPOLIA,
      EvmChain.BASE_SEPOLIA,
      GasToken.ETH
    );
    
    const destinationAddress = ethers.zeroPadValue(await signer.getAddress(), 32);
    const metadata = "0x"; // Empty metadata for simple transfer

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "base-sepolia",
      destinationAddress,
      amount,
      metadata,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
    const receipt = await transferTx.wait();

    // Monitor transfer status
    const transferStatus = await gmpRecoveryApi.queryTransactionStatus(receipt.hash);
    console.log("Transfer Status:", transferStatus);

    // If transfer is pending, set up monitoring
    if (transferStatus === 'pending') {
      console.log("Transfer pending. Setting up monitoring...");
      const monitor = setInterval(async () => {
        const status = await gmpRecoveryApi.queryTransactionStatus(receipt.hash);
        console.log(`Current transfer status: ${status}`);
        if (status !== 'pending') {
          clearInterval(monitor);
          console.log("Transfer completed with status:", status);
        }
      }, 30000); // Check every 30 seconds
    }

    console.log(`Successfully initiated transfer of ${amount} tokens from Ethereum to Base`);
    return receipt.hash;
  } catch (error) {
    handleError("Error transferring tokens from Ethereum to Base", error);
    throw error;
  }
}

// Error handler
function handleError(message, error) {
  console.error(`${message}:`, error);
  console.error("Error details:", {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: error.code,
    data: error.data
  });
}

// Main function to orchestrate the deployment and setup
async function main() {
  try {
    // Step 1: Deploy token manager on Base
    console.log("Deploying token manager on Base...");
    const baseDeployment = await deployTokenManagerBase();
    console.log("Base deployment complete");

    // Step 2: Approve tokens on Base
    console.log("Approving tokens on Base...");
    await approveTokensOnBase(baseDeployment.tokenManagerAddress);
    console.log("Token approval complete");

    // Step 3: Deploy token manager on Ethereum
    console.log("Deploying token manager on Ethereum...");
    const ethDeployment = await deployRemoteTokenManager();
    console.log("Ethereum deployment complete");

    // Step 4: Grant roles on Ethereum
    console.log("Granting roles on Ethereum...");
    await transferMintAccessToTokenManagerOnEth(ethDeployment.tokenManagerAddress);
    console.log("Role granting complete");

    console.log("Bridge setup completed successfully!");
    
    return {
      baseDeployment,
      ethDeployment
    };
  } catch (error) {
    handleError("Error in main function", error);
    throw error;
  }
}

// Export functions for testing and individual usage
module.exports = {
  deployTokenManagerBase,
  deployRemoteTokenManager,
  transferMintAccessToTokenManagerOnEth,
  approveTokensOnBase,
  transferTokensBaseToEth,
  transferTokensEthToBase,
  main
};

// Execute main function if running directly
if (require.main === module) {
  main().catch((error) => {
    handleError("Unhandled error in main function", error);
    process.exit(1);
  });
}
