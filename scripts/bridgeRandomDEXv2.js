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
const interchainTokenServiceContractABI = require("../utils/interchainTokenServiceABI.json");
const interchainTokenFactoryContractABI = require("../utils/interchainTokenFactoryABI.json");
const baseRandomDEXTokenABI = require("../utils/RandomDEXABI.json");
const ethRandomDEXTokenABI = require("../utils/EthRandomDEXABI.json");

// Constants
const MINT_BURN = 4;
const LOCK_UNLOCK = 2;

// Contract addresses
const interchainTokenServiceContractAddress = process.env.INTERCHAIN_SERVICE_CONTRACT_ADDRESS;
const baseRandomDEXTokenAddress = process.env.BASE_RANDOMDEX_CONTRACT_ADDRESS;
const ethRandomDEXTokenAddress = process.env.ETH_RANDOMDEX_CONTRACT_ADDRESS;
const interchainTokenFactoryContractAddress = process.env.INTERCHAIN_FACTORY_CONTRACT_ADDRESS;
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

// Register token metadata for Base blockchain
async function registerTokenMetadataOnBase() {
  try{
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    // Step 1: Register token metadata with new error handling
    const registerMetadataTx = await interchainTokenServiceContract.registerTokenMetadata(
      baseRandomDEXTokenAddress,
      ethers.parseEther("0.0001"),
      { value: ethers.parseEther("0.0001") }
    );
    
    console.log("Register Metadata Transaction Hash:", registerMetadataTx.hash);
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
// Register token metadata for Ethereum blockchain
async function registerTokenMetadataOnEth() {
  try{const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    // Step 1: Register token metadata with new error handling
    const registerMetadataTx = await interchainTokenServiceContract.registerTokenMetadata(
      ethRandomDEXTokenAddress,
      ethers.parseEther("0.0001"),
      { value: ethers.parseEther("0.0001") }
    );
    
    console.log("Register Metadata Transaction Hash:", registerMetadataTx.hash);
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

async function registerCustomTokenOnBase() {
   // Generate random salt
   const salt = "0x" + crypto.randomBytes(32).toString("hex");
   // Get a signer to sign the transaction
   const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
  
   // Get the interchainTokenFactory contract instance
   const interchainTokenFactoryContract = await getContractInstance(
     interchainTokenFactoryContractAddress,
     interchainTokenFactoryContractABI,
     signer,
   );
 
   // Register token metadata
   const deployTxData = await interchainTokenFactoryContract.registerCustomToken(
     salt, // salt
     baseRandomDEXTokenAddress, // token address
     LOCK_UNLOCK, // token management type
     signer.address, // Address who has deployed the rdx token contract  
     { value: ethers.parseEther("0.001") },
   );
 
   console.log(`
     Transaction Hash: ${deployTxData.hash},
     salt: ${salt}`);
}

async function linkCustomToken() {
  // Get a signer to sign the transaction
  const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
  // Get the interchainTokenFactory contract instance
  const interchainTokenFactoryContract = await getContractInstance(
    interchainTokenFactoryContractAddress,
    interchainTokenFactoryContractABI,
    signer,
  );

  // Register token metadata
  const deployTxData = await interchainTokenFactoryContract.linkToken(
    process.env.TOKEN_SALT, // salt, same as previously used
    "ethereum-sepolia", // destination chain
    ethRandomDEXTokenAddress, // destination token address
    MINT_BURN, // token manager type
    signer.address, // Address who has deployed the rdx token contract 
    ethers.parseEther("0.001"), // gas value
    { value: ethers.parseEther("0.001") },
  );

  console.log(`Transaction Hash: ${deployTxData.hash}`);
}
async function getTokenManagerAddress() {
  // Get a signer to sign the transaction
  const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

  // Get the interchainTokenFactory contract instance
  const interchainTokenFactoryContract = await getContractInstance(
    interchainTokenFactoryContractAddress,
    interchainTokenFactoryContractABI,
    signer,
  );  
  const interchainTokenServiceContract = await getContractInstance(
    interchainTokenServiceContractAddress,
    interchainTokenServiceContractABI,
    signer
  );


  // Register token metadata
  const tokenId = await interchainTokenFactoryContract.linkedTokenId(
    signer.address, // sender
    process.env.TOKEN_SALT, // salt, same as previously used
  );

  const tokenManagerAddress =
    await interchainTokenServiceContract.tokenManagerAddress(tokenId);

  console.log(`
    Token Manager Address: ${tokenManagerAddress},
    Token ID: ${tokenId}`);
}
// Transfer mint access on all chains to the Expected Token Manager : BSC
async function transferMintAccessToTokenManagerOnEth() {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEY);

    const tokenContract = await getContractInstance(
      ethRandomDEXTokenAddress,
      ethRandomDEXTokenABI,
      signer
    );

    const minterRole = await tokenContract.MINT_ROLE();
    const burnRole = await tokenContract.BURN_ROLE();

    const grantMinterTx = await tokenContract.grantRole(
      minterRole,
      process.env.TOKEN_MANAGER_ADDRESS // Token Manager Address for Ethereum
    );
    console.log("Grant Minter Role Transaction Hash:", grantMinterTx.hash);

    const grantBurnTx = await tokenContract.grantRole(
      burnRole,
      process.env.TOKEN_MANAGER_ADDRESS // Token Manager Address for Ethereum
    );
    console.log("Grant Burn Role Transaction Hash:", grantBurnTx.hash);
  } catch (error) {
    handleError("Error transferring mint access on Ethereum", error);
  }
}

async function transferTokens() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);
    const signerAddress = await signer.getAddress();

    // First check token balance
    const tokenContract = await getContractInstance(
      baseRandomDEXTokenAddress,
      baseRandomDEXTokenABI,
      signer
    );

    const balance = await tokenContract.balanceOf(signerAddress);
    const transferAmount = ethers.parseEther("10");
    
    console.log("Current token balance:", ethers.formatEther(balance));
    console.log("Transfer amount:", ethers.formatEther(transferAmount));

    if (balance < transferAmount) {
      throw new Error(`Insufficient token balance. Have ${ethers.formatEther(balance)}, need ${ethers.formatEther(transferAmount)}`);
    }

    console.log("Approving tokens for transfer...");
    const approveTx = await tokenContract.approve(
      interchainTokenServiceContractAddress,
      transferAmount
    );
    await approveTx.wait();
    console.log("Approval confirmed!");

    // Verify allowance
    const allowance = await tokenContract.allowance(signerAddress, interchainTokenServiceContractAddress);
    console.log("Current allowance:", ethers.formatEther(allowance));

    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    // Use higher gas amount
    const gasAmount = ethers.parseEther("0.005"); // Increased gas amount
    console.log("Using gas amount:", ethers.formatEther(gasAmount));

    const destinationAddress = ethers.getAddress(process.env.ETHEREUM_RECEIVER_ADDRESS_V1);
    console.log("Initiating transfer with params:");
    console.log("Token ID:", process.env.TOKEN_ID_V1);
    console.log("Destination Chain:", "ethereum-sepolia");
    console.log("Receiver:", destinationAddress);
    console.log("Amount:", ethers.formatEther(transferAmount));

    // Prepare the transfer transaction
    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID_V1,
      "ethereum-sepolia",
      destinationAddress,
      transferAmount,
      "0x",
      gasAmount,
      {
        value: gasAmount,
        gasLimit: 500000  // Reduced gas limit to a more reasonable value
      }
    );


    console.log("Transfer Transaction Hash:", transferTx.hash);
    
    // Wait for transaction confirmation
    const receipt = await transferTx.wait();
    console.log("Transfer confirmed in block:", receipt.blockNumber);
    
  } catch (error) {
    handleError("Error transferring tokens from Base to Ethereum", error);
    // Log more detailed error information
    console.error("Detailed error:", {
      message: error.message,
      code: error.code,
      data: error.data,
      transaction: error.transaction
    });
  }
}

async function approveTokensOnBase() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

    const tokenContract = await getContractInstance(
      baseRandomDEXTokenAddress,
      baseRandomDEXTokenABI,
      signer
    );

    const approveTx = await tokenContract.approve(
      interchainTokenServiceContractAddress,
      ethers.parseEther("500")
    );
    console.log("Approve Transaction Hash:", approveTx.hash);
  } catch (error) {
    handleError("Error approving tokens on Base", error);
  }
}
async function approveTokensOnEth() {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEYY);

    const tokenContract = await getContractInstance(
      ethRandomDEXTokenAddress,
      ethRandomDEXTokenABI,
      signer
    );

    const approveTx = await tokenContract.approve(
      interchainTokenServiceContractAddress,
      ethers.parseEther("500")
    );
    console.log("Approve Transaction Hash:", approveTx.hash);
  } catch (error) {
    handleError("Error approving tokens on Ethereum", error);
  }
}
// Transfer tokens from Base to Ethereum
async function transferTokensBaseToEth() {
  try {
    const signer = await getSigner(process.env.BASE_SEPOLIA_RPC_URL, process.env.PRIVATE_KEY);

    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const gasAmount = await gasEstimatorForEth("10");
    console.log(`Gas amount: ${gasAmount}`);

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "ethereum-sepolia",
      process.env.ETHEREUM_RECEIVER_ADDRESS,
      ethers.parseEther("10"),
      "0x",
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
  } catch (error) {
    handleError("Error transferring tokens from Base to Ethereum", error);
  }
}
// Transfer tokens from Ethereum to Base
async function transferTokensEthToBase() {
  try {
    const signer = await getSigner(process.env.ETHEREUM_TESTNET_RPC, process.env.PRIVATE_KEYY);
    const interchainTokenServiceContract = await getContractInstance(
      interchainTokenServiceContractAddress,
      interchainTokenServiceContractABI,
      signer
    );

    const gasAmount = await gasEstimatorForEth("5");
    console.log(`Gas amount: ${gasAmount}`);
    
    const metadata = "0x";

    const transferTx = await interchainTokenServiceContract.interchainTransfer(
      process.env.TOKEN_ID,
      "base-sepolia",
      "0x0fF019f527aDCF3d24A90086A5B0ed52eCE80fA8",
      ethers.parseEther("5"),
      metadata,
      gasAmount,
      { value: gasAmount }
    );

    console.log("Transfer Transaction Hash:", transferTx.hash);
    const receipt = await transferTx.wait();

  
    console.log(`Successfully initiated transfer of tokens from Ethereum to Base`);
    return receipt.hash;
  } catch (error) {
    handleError("Error transferring tokens from Ethereum to Base", error);
    throw error;
  }
}

// Check gas estimation between chains
async function checkGasEstimation() {
  try {
    // Check gas for Base to Ethereum transfer
    const baseToEthGas = await gasEstimator(
      "base-sepolia",
      "ethereum-sepolia",
      "aETH"
    );
    console.log('Estimated gas fee (Base -> Ethereum):', baseToEthGas);

    // Check gas for Ethereum to Base transfer
    const ethToBaseGas = await gasEstimator(
      "ethereum-sepolia",
      "base-sepolia",
      "aETH"
    );
    console.log('Estimated gas fee (Ethereum -> Base):', ethToBaseGas);

    return { baseToEthGas, ethToBaseGas };
  } catch (error) {
    handleError('Error checking gas estimation', error);
    throw error;
  }
}
// Updated gas estimator with recovery API
async function gasEstimator(sourceChain, destinationChain, tokenSymbol = "ETH") {
  try {
    // Map chain names to Axelar chain identifiers
    const chainMapping = {
      'base-sepolia': 'base',
      'ethereum-sepolia': 'ethereum'
    };

    const source = chainMapping[sourceChain] || sourceChain;
    const destination = chainMapping[destinationChain] || destinationChain;

    const gas = await api.estimateGasFee(
      source,
      destination,
      tokenSymbol,
      1000000 // Default gas amount
    );
    return gas;
  } catch (error) {
    handleError("Error estimating gas", error);
    throw error;
  }
}
async function gasEstimatorForEth(amount) {
  try {
    const executeData = "0x";

    const gmpParams = {
      destinationContractAddress: process.env.BASE_RECEIVER_ADDRESS,
      sourceContractAddress: process.env.ETH_SENDER_ADDRESS,
      tokenSymbol: "ETH",
      transferAmount: ethers.parseEther(amount).toString()
    };

    const gas = await api.estimateGasFee(
      EvmChain.SEPOLIA,
      EvmChain.BASE_SEPOLIA,
      3000000,  // Increased gas limit
      1.3,      // Increased multiplier for better estimation
      GasToken.ETH,
      "0",
      executeData,
      gmpParams
    );

    return gas;
  } catch (error) {
    handleError("Error estimating gas", error);
    console.error("Detailed gas estimation error:", error);
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

// Main entry point
async function main() {
  const functionName = process.env.FUNCTION_NAME;
  switch (functionName) {
    case "registerTokenMetadataOnBase":
      await registerTokenMetadataOnBase();
      break;
    case "registerTokenMetadataOnEth":
      await registerTokenMetadataOnEth();
      break;
    case "registerCustomTokenOnBase":
      await registerCustomTokenOnBase();
      break;
    case "linkCustomToken":
      await linkCustomToken();
      break;
    case "getTokenManagerAddress":
      await getTokenManagerAddress();
      break;
    case "transferMintAccessToTokenManagerOnEth":
      await transferMintAccessToTokenManagerOnEth();
      break;
    case "deployRemoteTokenManager":
      await deployRemoteTokenManager();
      break;
    case "transferTokensBaseToEth":
      await transferTokensBaseToEth();
      break;
    case "transferTokens":
      await transferTokens();
      break;
    case "transferTokensEthToBase":
      await transferTokensEthToBase();
      break;

    case "checkGasEstimation":
      await checkGasEstimation();
      break;
    case "approveTokensOnBase":
      await approveTokensOnBase();
      break;
    case "approveTokensOnEth":
      await approveTokensOnEth();
      break;
      
    default:
      console.error(`Unknown function: ${functionName}`);
      process.exitCode = 1;
  }
}

// Export functions for testing and individual usage
module.exports = {
  registerTokenMetadataOnBase,
  registerTokenMetadataOnEth,
  transferTokensBaseToEth,
  transferTokensEthToBase,
  main
};

// Execute main function if running directly
if (require.main === module) {
  main().catch((error) => handleError("Unhandled error in main function", error));
}
