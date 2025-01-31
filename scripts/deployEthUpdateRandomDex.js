const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying RandomDEX with account:", deployer.address);

  // Constructor parameters
  const defaultAdmin = deployer.address;
  const feeCollector = process.env.FEE_COLLECTOR; // My own wallet address
  const feeMaximumNumerator = 5; // 5% maximum fee
  const feeDenominator = 100;
  const fees = {
    buy: 2,  // 2% buy fee
    sell: 2   // 2% sell fee
  };
  const antiBotFees = {
    buy: 25,  // 25% antibot buy fee
    sell: 25   // 25% antibot sell fee
  };
  const antibotEndTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
  const maxSupply = ethers.parseEther("1000000000"); // maxSupply = 1,000,000,000
  const feeWaiverThreshold = ethers.parseEther("35000"); // feeWaiverThreshold = 35,000 RDX
  // Explicitly specify the contract from EthUpdatedRandomDEX.sol
  const RandomDEX = await ethers.getContractFactory("contracts/EthUpdatedRandomDEX.sol:RandomDEX");
  const randomDEX = await RandomDEX.deploy(
    defaultAdmin,
    feeCollector,
    feeMaximumNumerator,
    feeDenominator,
    fees,
    antiBotFees,
    antibotEndTimestamp,
    maxSupply,
    feeWaiverThreshold
  );

  await randomDEX.waitForDeployment();
  console.log("EthUpdatedRandomDEX deployed to:", await randomDEX.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });