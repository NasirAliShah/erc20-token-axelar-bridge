/** @type import('hardhat/config').HardhatUserConfig */
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: ".env" });

const SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.22",
  networks: {
    baseSepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: [PRIVATE_KEY],
    },
    ethereumSepolia: {
        url: process.env.ETHEREUM_TESTNET_RPC,
        chainId: 11155111,
        accounts: [process.env.PRIVATE_KEY],
    },
  },
};