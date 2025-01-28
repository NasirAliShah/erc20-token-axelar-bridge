// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;


import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title ERC20Fee
 * @notice An implementation of smart contract to manage and calculate fees.
 */
abstract contract ERC20Fee is ERC20, AccessControl {
    struct Fees {
        uint16 buy;
        uint16 sell;
    }

    /// @notice Roles for liquidity pool addresses.
    bytes32 public constant DEX_ROLE = keccak256("DEX_ROLE");

    /// @notice The maximum total fee numerator.
    uint16 public immutable maximumNumerator;

    /// @notice Common denominator for all fees.
    uint16 public immutable denominator;

    /// @notice The fee transfer numerators.
    Fees public fees;

    /// @notice The antibot fee transfer numerators.
    Fees public antiBotFees;

    /// @notice The address of the fee collector.
    address public feeCollector;

    /// @notice Timestamp after antibot ends.
    uint256 public antibotEndTimestamp;

    /// @notice Emitted when the fee transfer numerator is updated.
    /// @param fees The new fee transfer numerators.
    event FeesUpdated(Fees fees);

    /// @notice Emitted when the fee collector address is updated.
    /// @param feeCollector The new fee collector address.
    event FeeCollectorUpdated(address feeCollector);

    /// @notice Emitted when the antibot ends timestamp is updated.
    /// @param antibotEndTimestamp The new antibot ends timestamp.
    event AntibotEndTimestampUpdated(uint256 antibotEndTimestamp);

    /// @notice The error message when the fee collector is the zero address.
    error UnacceptableReference();

    /// @notice The error message when numerator or denominator are not valid.
    error UnacceptableValue();

    /// @notice The error message when the antibot end timestamp is in the past.
    error AfterAntibotEndTimestamp();

    /// @notice The error message when the fee numerator is bigger than the maximum numerator.
    error CannotBeBiggerThanMaximumNumerator();

    /// @notice Modifier to check if the fee numerator is in the valid range.
    /// Numerator must be less than denominator.
    /// Numerators must be less than or equal maximumNumerator.
    /// @param fees_ The fee transfer numerators.
    modifier validateFee(Fees memory fees_) {
        if (fees_.buy > maximumNumerator || fees_.sell > maximumNumerator) {
            revert CannotBeBiggerThanMaximumNumerator();
        }
        _;
    }

    /// @notice Contract state initialization.
    /// @param defaultAdmin_ The default admin address.
    /// @param feeCollector_ The fee collector address.
    /// @param maximumNumerator_  The maximum fee numerator.
    /// @param denominator_ The common denominator for all fees.
    /// @param fees_ The fee transfer numerators.
    /// @param antiBotFees_ The antibot fee transfer numerators.
    /// @param antibotEndTimestamp_ The antibot ends timestamp.
    constructor(
        address defaultAdmin_,
        address feeCollector_,
        uint16 maximumNumerator_,
        uint16 denominator_,
        Fees memory fees_,
        Fees memory antiBotFees_,
        uint256 antibotEndTimestamp_
    ) {
        if (feeCollector_ == address(0)) revert UnacceptableReference();
        if (maximumNumerator_ >= denominator_) revert UnacceptableValue();

        if (fees_.buy > maximumNumerator_ || fees_.sell > maximumNumerator_) {
            revert CannotBeBiggerThanMaximumNumerator();
        }

        if (antibotEndTimestamp_ < block.timestamp) revert UnacceptableValue();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin_);

        feeCollector = feeCollector_;
        maximumNumerator = maximumNumerator_;
        denominator = denominator_;
        fees = fees_;
        antiBotFees = antiBotFees_;
        antibotEndTimestamp = antibotEndTimestamp_;

        emit FeesUpdated(fees_);
        emit FeeCollectorUpdated(feeCollector_);
        emit AntibotEndTimestampUpdated(antibotEndTimestamp_);
    }

    /// @notice Update the fee transfer numerators.
    /// It changes the configuration, so it must be called by an account with the appropriate permissions (`DEFAULT_ADMIN_ROLE` role).
    /// @param fees_ The new fee transfer numerators.
    function updateFees(Fees memory fees_) external onlyRole(DEFAULT_ADMIN_ROLE) validateFee(fees_) {
        fees = fees_;

        emit FeesUpdated(fees_);
    }

    /// @notice Update the fee collector address.
    /// It changes the configuration, so it must be called by an account with the appropriate permissions (`DEFAULT_ADMIN_ROLE` role).
    /// @param feeCollector_ The new fee collector address.
    function updateFeeCollector(address feeCollector_) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeCollector_ == address(0)) revert UnacceptableReference();

        feeCollector = feeCollector_;

        emit FeeCollectorUpdated(feeCollector_);
    }

    /// @notice Update the antibot ends timestamp.
    /// It changes the configuration, so it must be called by an account with the appropriate permissions (`DEFAULT_ADMIN_ROLE` role).
    /// @param antibotEndTimestamp_ The new antibot ends timestamp.
    function updateAntibotEndTimestamp(uint256 antibotEndTimestamp_) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        // Must be before the current timestamp.
        if (antibotEndTimestamp < block.timestamp) revert AfterAntibotEndTimestamp();

        antibotEndTimestamp = antibotEndTimestamp_;

        emit AntibotEndTimestampUpdated(antibotEndTimestamp_);
    }

    /// @notice Calculates the fee depending on the transfer parties.
    /// @param sender Address whose tokens are being transferred.
    /// @param from The address of the sender.
    /// @param to The address of the recipient.
    /// @param value The value of tokens to transfer.
    /// @return fee The fee value.
    /// @return The value of tokens after the fee is deducted.
    function _computeFee(address sender, address from, address to, uint256 value)
        internal
        view
        virtual
        returns (uint256 fee, uint256)
    {
        if (hasRole(DEFAULT_ADMIN_ROLE, sender) || hasRole(DEFAULT_ADMIN_ROLE, from) || hasRole(DEFAULT_ADMIN_ROLE, to))
        {
            return (fee, value);
        }

        if (hasRole(DEX_ROLE, from)) {
            uint16 buyFee = antibotEndTimestamp < block.timestamp ? fees.buy : antiBotFees.buy;

            fee = (value * buyFee) / denominator;
        } else if (hasRole(DEX_ROLE, to)) {
            uint16 sellFee = antibotEndTimestamp < block.timestamp ? fees.sell : antiBotFees.sell;

            fee = (value * sellFee) / denominator;
        }

        unchecked {
            value -= fee;
        }

        return (fee, value);
    }
}
