// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;


import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

import "../libraries/ERC20Fee.sol"; // Local library import remains the same

/**
 * @title RandomDEX
 * @notice An implementation of RandomDEX token smart contract.
 */
contract RandomDEX is ERC20, ERC20Permit, AccessControl, ERC20Fee {
    /// @notice Token contract state initialization.
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
        _mint(defaultAdmin_, 1_000_000_000 * 10 ** decimals());
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);
    }

    /// @notice Overrides the ERC20 _transfer function to include fees.
    /// @param from The address of the sender.
    /// @param to The address of the recipient.
    /// @param value The value of tokens to transfer.
    function _update(address from, address to, uint256 value) internal virtual override {
        (uint256 fee, uint256 rest) = _computeFee(_msgSender(), from, to, value);

        if (fee > 0) super._transfer(from, feeCollector, fee);

        super._update(from, to, rest);
    }
}
