const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying RandomDEX with account:", deployer.address);

  // Constructor parameters
  const defaultAdmin = deployer.address;
  const feeCollector = deployer.address; // You can change this to a different address
  const feeMaximumNumerator = 3; // 3% maximum fee
  const feeDenominator = 100;
  const fees = {
    buy: 2,  // 2% buy fee
    sell: 2  // 2% sell fee
  };
  const antiBotFees = {
    buy: 25,  // 25% antibot buy fee
    sell: 25  // 25% antibot sell fee
  };
  const antibotEndTimestamp = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now

  // Explicitly specify the contract from RandomDEX.sol
  const RandomDEX = await ethers.getContractFactory("contracts/RandomDEX.sol:RandomDEX");
  const randomDEX = await RandomDEX.deploy(
    defaultAdmin,
    feeCollector,
    feeMaximumNumerator,
    feeDenominator,
    fees,
    antiBotFees,
    antibotEndTimestamp
  );

  await randomDEX.waitForDeployment();
  console.log("RandomDEX deployed to:", await randomDEX.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });