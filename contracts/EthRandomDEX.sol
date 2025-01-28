// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;


import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import "../libraries/ERC20Fee.sol"; // Local library import remains the same

/**
 * @title RandomDEX (Ethereum)
 * @notice An implementation of RandomDEX token smart contract with mint/burn functionality for Axelar bridging.
 */
contract RandomDEX is ERC20, ERC20Permit, AccessControl, ERC20Fee {
    /// @dev Role for Axelar Router to call mint and burn
    bytes32 public constant MINT_ROLE = keccak256("MINT_ROLE");
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");


    /// @notice Initializes the RandomDEX contract.
    /// @param defaultAdmin_ The default admin address.
    /// @param feeCollector_ The fee collector address.
    /// @param feeMaximumNumerator_ The maximum fee numerator.
    /// @param feeDenominator_ The common denominator for all fees.
    /// @param fees_ The fee transfer numerators.
    /// @param antiBotFees_ The antibot fee transfer numerators.
    /// @param antibotEndTimestamp_ The antibot ends timestamp.
    constructor(
        address defaultAdmin_,
        address feeCollector_,
        uint16 feeMaximumNumerator_,
        uint16 feeDenominator_,
        Fees memory fees_,
        Fees memory antiBotFees_,
        uint256 antibotEndTimestamp_
    )
        ERC20("RandomDEX", "RDX")
        ERC20Permit("RandomDEX")
        ERC20Fee(
            defaultAdmin_,
            feeCollector_,
            feeMaximumNumerator_,
            feeDenominator_,
            fees_,
            antiBotFees_,
            antibotEndTimestamp_
        )
    {
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);
    }

     /**
     * @notice Mint tokens (called by Axelar Router during bridging from Base to Ethereum).
     * @param to The recipient address.
     * @param amount The number of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINT_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens (called by Axelar Router during bridging from Ethereum to Base).
     * @param from The address to burn tokens from.
     * @param amount The number of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(BURN_ROLE) {
        _burn(from, amount);
    }
}
