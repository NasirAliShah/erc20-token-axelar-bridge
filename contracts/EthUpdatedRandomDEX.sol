// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "../libraries/ERC20Fee.sol";

/**
 * @title RandomDEX
 * @notice RandomDEX is a token with cross-chain mint/burn functionality, fee exemptions for specific users, and advanced fee management logic.
 */
contract RandomDEX is ERC20, ERC20Permit, AccessControl, ERC20Fee {
    // Define role identifiers for minting, burning, and whitelist management
    bytes32 public constant MINT_ROLE = keccak256("MINT_ROLE");
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");
    bytes32 public constant WHITELIST_MANAGER_ROLE = keccak256("WHITELIST_MANAGER_ROLE");

    // Whitelist for fee exemptions
    mapping(address => bool) private _whitelist;

    // The maximum supply of tokens that can be minted
    uint256 public maxSupply;

    // Minimum balance required to waive transaction fees
    uint256 public feeWaiverThreshold;

    /// @dev Events to track actions in the contract
    event FeeWaiverThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event AddressWhitelisted(address indexed account);
    event AddressRemovedFromWhitelist(address indexed account);
    event FeeCharged(address indexed from, address indexed to, uint256 fee);
    event TransferCompleted(address indexed from, address indexed to, uint256 amount);

    /**
     * @dev Constructor to initialize the RandomDEX token with all required parameters.
     * @param defaultAdmin_ The address with the `DEFAULT_ADMIN_ROLE` role.
     * @param feeCollector_ The address that collects transaction fees.
     * @param feeMaximumNumerator_ The maximum numerator for fee percentages.
     * @param feeDenominator_ The denominator for fee calculations.
     * @param fees_ The standard buy/sell fees configuration.
     * @param antiBotFees_ The antibot buy/sell fees configuration.
     * @param antibotEndTimestamp_ The timestamp when antibot fees end.
     * @param maxSupply_ The maximum supply of tokens that can be minted.
     * @param initialFeeWaiverThreshold_ The initial threshold for fee exemption.
     */
    constructor(
        address defaultAdmin_,
        address feeCollector_,
        uint16 feeMaximumNumerator_,
        uint16 feeDenominator_,
        Fees memory fees_,
        Fees memory antiBotFees_,
        uint256 antibotEndTimestamp_,
        uint256 maxSupply_,
        uint256 initialFeeWaiverThreshold_
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
        require(defaultAdmin_ != address(0), "Invalid admin address");
        require(feeCollector_ != address(0), "Invalid fee collector address");
        require(maxSupply_ > 0, "Max supply must be greater than zero");

        // Initialize state variables
        maxSupply = maxSupply_;
        feeWaiverThreshold = initialFeeWaiverThreshold_;

        // Grant roles to the default admin
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);
        // _grantRole(MINT_ROLE, defaultAdmin_);
        // _grantRole(BURN_ROLE, defaultAdmin_);
        _grantRole(WHITELIST_MANAGER_ROLE, defaultAdmin_);
    }

    /**
     * @notice Mint new tokens to a specified address.
     * @dev Only callable by accounts with the `MINT_ROLE`.
     * Emits a `TokensMinted` event.
     * @param to The address receiving the minted tokens.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINT_ROLE) {
        require(to != address(0), "Mint to zero address");
        require(amount > 0, "Mint amount must be greater than zero");
        require(totalSupply() + amount <= maxSupply, "Exceeds maximum supply");

        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Burn tokens from a specified address.
     * @dev Only callable by accounts with the `BURN_ROLE`.
     * Emits a `TokensBurned` event.
     * @param from The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(BURN_ROLE) {
        require(from != address(0), "Burn from zero address");
        require(amount > 0, "Burn amount must be greater than zero");

        _burn(from, amount);
        emit TokensBurned(from, amount);
    }

    /**
     * @notice Update the fee waiver threshold for fee exemptions.
     * @dev Only callable by accounts with the `DEFAULT_ADMIN_ROLE`.
     * Emits a `FeeWaiverThresholdUpdated` event.
     * @param newThreshold The new fee waiver threshold value.
     */
    function updateFeeWaiverThreshold(uint256 newThreshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newThreshold > 0, "Threshold must be greater than zero");
        uint256 oldThreshold = feeWaiverThreshold;
        feeWaiverThreshold = newThreshold;

        emit FeeWaiverThresholdUpdated(oldThreshold, newThreshold);
    }

    /**
     * @notice Override `_update` to handle fee collection and exemptions during token transfers.
     * Emits `FeeCharged` and `TransferCompleted` events.
     * @param from The sender's address.
     * @param to The recipient's address.
     * @param amount The amount of tokens to transfer.
     */
    function _update(address from, address to, uint256 amount) internal virtual override(ERC20) {
        // Skip fee calculation for minting and burning
        if (from == address(0) || to == address(0)) {
            super._update(from, to, amount);
            emit TransferCompleted(from, to, amount);
            return;
        }

        // Check for fee exemptions
        if (
            hasRole(DEFAULT_ADMIN_ROLE, _msgSender()) ||
            _whitelist[from] ||
            balanceOf(from) >= feeWaiverThreshold
        ) {
            super._update(from, to, amount);
            emit TransferCompleted(from, to, amount);
            return;
        }

        // Calculate fees using the base ERC20Fee logic
        (uint256 fee, uint256 rest) = super._computeFee(_msgSender(), from, to, amount);

        // If there's a fee, transfer it to the fee collector
        if (fee > 0) {
            super._transfer(from, feeCollector, fee);
            emit FeeCharged(from, to, fee);
        }

        // Transfer the remaining amount
        super._update(from, to, rest);
        emit TransferCompleted(from, to, rest);
    }

    /**
     * @notice Add an address to the whitelist for fee exemptions.
     * @dev Only callable by accounts with the `WHITELIST_MANAGER_ROLE`.
     * Emits an `AddressWhitelisted` event.
     * @param account The address to whitelist.
     */
    function addToWhitelist(address account) external onlyRole(WHITELIST_MANAGER_ROLE) {
        require(account != address(0), "Invalid address");
        _whitelist[account] = true;
        emit AddressWhitelisted(account);
    }

    /**
     * @notice Remove an address from the whitelist.
     * @dev Only callable by accounts with the `WHITELIST_MANAGER_ROLE`.
     * Emits an `AddressRemovedFromWhitelist` event.
     * @param account The address to remove from the whitelist.
     */
    function removeFromWhitelist(address account) external onlyRole(WHITELIST_MANAGER_ROLE) {
        require(account != address(0), "Invalid address");
        _whitelist[account] = false;
        emit AddressRemovedFromWhitelist(account);
    }

    /**
     * @notice Check if an address is whitelisted for fee exemptions.
     * @param account The address to check.
     * @return True if the address is whitelisted, otherwise false.
     */
    function isWhitelisted(address account) external view returns (bool) {
        return _whitelist[account];
    }
}
