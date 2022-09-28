//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

import "./TakepileToken.sol";
import "./Vault.sol";
import "./interfaces/ITakepileDriver.sol";
import "./TakepileFactory.sol";

/// @title TakepileDriver Contract
/// @notice Responsible for creation of new Takepiles and Vaults,
/// @notice as well as management of their configurations
contract TakepileDriver is ITakepileDriver, Ownable {
    using Address for address;
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    /// @notice Emitted when a Takepile is created
    event TakepileCreated(address takepile, string name, string symbol);

    /// @notice Emitted when a Vault is created
    event VaultCreated(address vault);

    /// @notice Emitted when the Takepile Factory contract is updated
    event TakepileFactoryUpdated(address takepileFactory);

    /// @notice Emitted when the Distributor Factory contract is updated
    event DistributorFactoryUpdated(address distributorFactory);

    /// @notice Emitted when a Takepile's configuration is updated
    event TakepileConfigUpdated(
        address takepile,
        uint256 distributionRate,
        uint256 burnFeeDivisor,
        uint256 treasuryFeeDivisor,
        uint256 distributionFeeDivisor,
        uint256 limitFeeDivisor,
        uint256 liquidationRewardDivisor,
        uint256 maximumAmountDivisor,
        uint256 minimumAmount,
        uint256 minimumDuration,
        uint256 minimumDepositDuration,
        uint256 takeRequirement
    );

    /// @notice Emitted when a Vault's distribution rate is updated
    event VaultConfigUpdated(
        address vault,
        uint256 rate0,
        uint256 rate1,
        uint256 rate2,
        uint256 rate3
    );

    /// @notice Takepile Distribution Configurations
    /// @dev For fees: position.amount / divisor = fee
    /// @dev manipulatable Takepile configuration elements are defined here; static ones on Takepile
    struct TakepileConfig {
        uint256 timestamp;
        uint256 distributionRate; // distribution rate per second, scaled by 1e27
        uint256 burnFeeDivisor;
        uint256 treasuryFeeDivisor;
        uint256 distributionFeeDivisor;
        uint256 limitFeeDivisor;
        uint256 liquidationRewardDivisor;
        uint256 maximumAmountDivisor; // position.amount must be < position.amount / maximumAmountDivisor
        uint256 minimumAmount; // position.amount must be > minimumAmount
        uint256 minimumDuration; // the minimum position duration for rewards
        uint256 minimumDepositDuration; // the minimum amount of time to wait after deposit before withdrawal permitted
        uint256 takeRequirement; // the minimum amount of TAKE needed by a user to place a trade
    }

    /// @notice Vault Distribution Configurations
    struct VaultConfig {
        uint256 timestamp;
        uint256 rate0; // base rate for no unlock period
        uint256 rate1; // rate for lockups >= 30 days
        uint256 rate2; // rate for lockups >= 180 days
        uint256 rate3; // rate for lockups >= 365 days
    }

    /// @notice the Takepile Governance token address
    address public TAKE;

    /// @notice the Takepile takepileFactory contract address
    address public takepileFactory;

    /// @notice the Takepile Fee Distributor contract address
    address public distributorFactory;

    /// @notice the Takepile treasury address
    address public treasury;

    /// @notice the Takepile Liquidation Pass NFT address
    address public liquidationPass;

    /// @notice official takepiles
    address[] public takepiles;

    /// @notice offical ERC20 token vaults
    address[] public vaults;

    /// @notice Takepile configurations
    mapping(address => TakepileConfig) public takepileConfig;

    /// @notice Vault configurations
    mapping(address => VaultConfig) public vaultConfig;

    /// @notice only registered takepiles
    modifier onlyTakepile() {
        require(takepileConfig[msg.sender].timestamp > 0, "Takepile: Takepile does not exist");
        _;
    }

    /// @notice only registered vaults
    modifier onlyVault() {
        require(vaultConfig[msg.sender].timestamp > 0, "Takepile: Vault does not exist");
        _;
    }

    /// @notice TakepileDriver constructor
    /// @param _TAKE the TAKE governance token address
    constructor(
        address _TAKE,
        address _takepileFactory,
        address _xTakeFactory,
        address _treasury,
        address _liquidationPass
    ) {
        transferOwnership(msg.sender);
        TAKE = _TAKE;
        takepileFactory = _takepileFactory;
        distributorFactory = _xTakeFactory;
        treasury = _treasury;
        liquidationPass = _liquidationPass;
        emit TakepileFactoryUpdated(takepileFactory);
        emit DistributorFactoryUpdated(distributorFactory);
    }

    /// @notice create a new Takepile
    /// @param underlying the Takepile's underlying ERC-20 token address
    function createTakepile(
        address underlying,
        string calldata name,
        string calldata symbol,
        uint256 maxLeverage
    ) external override onlyOwner {
        address takepile = TakepileFactory(takepileFactory).createTakepile(
            address(this),
            distributorFactory,
            underlying,
            name,
            symbol,
            maxLeverage
        );
        TakepileConfig memory _config = TakepileConfig(
            block.timestamp,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0
        );
        takepileConfig[address(takepile)] = _config;
        takepiles.push(address(takepile));
        TakepileToken(takepile).transferOwnership(msg.sender);
        emit TakepileCreated(address(takepile), name, symbol);
        emit TakepileConfigUpdated(address(takepile), 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0);
    }

    /// @notice create a new ERC20 token vault
    /// @param token the Vault's lpToken
    function createVault(string memory name, address token) external override onlyOwner {
        Vault vault = new Vault(name, address(this), token);
        VaultConfig memory _config = VaultConfig(block.timestamp, 0, 0, 0, 0);
        vaultConfig[address(vault)] = _config;
        vaults.push(address(vault));
        emit VaultCreated(address(vault));
        emit VaultConfigUpdated(address(vault), 0, 0, 0, 0);
    }

    /// @notice update the Takepile Factory contract
    /// @param _takepileFactory the new takepile factory address to use
    function updateTakepileFactory(address _takepileFactory) external override onlyOwner {
        takepileFactory = _takepileFactory;
        emit TakepileFactoryUpdated(_takepileFactory);
    }

    /// @notice update the Distributor Factory contract
    /// @param _distributorFactory the new distributor factory address to use
    function updateDistributorFactory(address _distributorFactory) external override onlyOwner {
        distributorFactory = _distributorFactory;
        emit DistributorFactoryUpdated(_distributorFactory);
    }

    /// @notice set a Takepile's distribution rate
    /// @param takepile the Takepile address
    /// @param rate the distribution rate (per second, per pile token) to set
    function setTakepileDistributionRate(address takepile, uint256 rate)
        external
        override
        onlyOwner
    {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: takepile does not exist");
        config.distributionRate = rate;
        emit TakepileConfigUpdated(
            takepile,
            rate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice set a Takepile's fee divisors
    /// @dev will divide position amount by each divisor to determine fee
    /// @param takepile the address of the takepile to update
    /// @param burnFeeDivisor the burn fee divisor
    /// @param treasuryFeeDivisor the treasury fee divisor
    /// @param distributionFeeDivisor the distribution fee divisor
    /// @param limitFeeDivisor the limit fee divisor
    function setTakepileFeeDivisors(
        address takepile,
        uint256 burnFeeDivisor,
        uint256 treasuryFeeDivisor,
        uint256 distributionFeeDivisor,
        uint256 limitFeeDivisor
    ) external override onlyOwner {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: configuration not found");
        config.burnFeeDivisor = burnFeeDivisor;
        config.treasuryFeeDivisor = treasuryFeeDivisor;
        config.distributionFeeDivisor = distributionFeeDivisor;
        config.limitFeeDivisor = limitFeeDivisor;
        emit TakepileConfigUpdated(
            takepile,
            config.distributionRate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice get Takepile fee divisors
    /// @param takepile the address of the takepile to get fee divisors for
    function getTakepileFeeDivisors(address takepile)
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        TakepileConfig memory config = takepileConfig[takepile];
        return (
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor
        );
    }

    /// @notice set a Takepile's liquidation reward divisor
    /// @param takepile the address of the takepile to update
    /// @param liquidationRewardDivisor the liquidation reward divisor
    function setTakepileLiquidationRewardDivisor(address takepile, uint256 liquidationRewardDivisor)
        external
        override
        onlyOwner
    {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: configuration not found");
        config.liquidationRewardDivisor = liquidationRewardDivisor;
        emit TakepileConfigUpdated(
            takepile,
            config.distributionRate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice get a Takepile's liquidation reward divisor
    /// @param takepile the address of the takepile to get liquidation reward divisor for
    function getTakepileLiquidationRewardDivisor(address takepile)
        external
        view
        override
        returns (uint256)
    {
        TakepileConfig memory config = takepileConfig[takepile];
        return config.liquidationRewardDivisor;
    }

    /// @notice set a Takepile's maximum amount divisor (relative) and minimum amount (absolute)
    function setTakepileAmountParameters(
        address takepile,
        uint256 maximumAmountDivisor,
        uint256 minimumAmount
    ) external override onlyOwner {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: configuration not found");
        config.maximumAmountDivisor = maximumAmountDivisor;
        config.minimumAmount = minimumAmount;
        emit TakepileConfigUpdated(
            takepile,
            config.distributionRate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice set a Takepile's minimum position duration for rewards
    /// @param takepile the address of the takpile
    /// @param minimumDuration the minimum duration (in seconds) a position needs to be open for before being applicable for rewards
    function setTakepileMinimumDuration(address takepile, uint256 minimumDuration)
        external
        override
        onlyOwner
    {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: configuration not found");
        config.minimumDuration = minimumDuration;
        emit TakepileConfigUpdated(
            takepile,
            config.distributionRate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice set a Takepile's minimum depsoit duration before withdrawals permitted
    /// @param takepile the address of the takpile
    /// @param minimumDuration the minimum duration (in seconds) after a deposit before withdrawal allowed
    function setTakepileMinimumDepositDuration(address takepile, uint256 minimumDuration)
        external
        override
        onlyOwner
    {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: configuration not found");
        config.minimumDepositDuration = minimumDuration;
        emit TakepileConfigUpdated(
            takepile,
            config.distributionRate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice set a Takepile's minimum TAKE requirement
    /// @notice users will need a balance of at least takeRequirement TAKE to enter a position
    function setTakepileTakeRequirement(address takepile, uint256 takeRequirement)
        external
        override
        onlyOwner
    {
        TakepileConfig storage config = takepileConfig[takepile];
        require(config.timestamp > 0, "Takepile: configuration not found");
        config.takeRequirement = takeRequirement;
        emit TakepileConfigUpdated(
            takepile,
            config.distributionRate,
            config.burnFeeDivisor,
            config.treasuryFeeDivisor,
            config.distributionFeeDivisor,
            config.limitFeeDivisor,
            config.liquidationRewardDivisor,
            config.maximumAmountDivisor,
            config.minimumAmount,
            config.minimumDuration,
            config.minimumDepositDuration,
            config.takeRequirement
        );
    }

    /// @notice set a Vault's  distribution rate
    /// @param vault the Takepile address
    /// @param rate0 the distribution rate (per second, per pile token) for no lock period
    /// @param rate1 the distribution rate for 1 month lockup
    /// @param rate2 the distribution rate for 6 month lockup
    /// @param rate3 the distribution rate for 12 month lockup
    function setVaultDistributionRates(
        address vault,
        uint256 rate0,
        uint256 rate1,
        uint256 rate2,
        uint256 rate3
    ) external override onlyOwner {
        VaultConfig storage config = vaultConfig[vault];
        require(config.timestamp > 0, "Takepile: vault does not exist");
        config.rate0 = rate0;
        config.rate1 = rate1;
        config.rate2 = rate2;
        config.rate3 = rate3;
        emit VaultConfigUpdated(vault, rate0, rate1, rate2, rate3);
    }

    /// @notice Calculate distribution rate for vault with a specific lockup period
    /// @param vault the vault address
    /// @param lockup the lockup period (seconds)
    function getVaultDistributionRate(address vault, uint256 lockup)
        public
        view
        override
        returns (uint256)
    {
        VaultConfig memory config = vaultConfig[vault];
        if (lockup >= 365 days) {
            return config.rate3;
        } else if (lockup >= 180 days) {
            return config.rate2;
        } else if (lockup >= 30 days) {
            return config.rate1;
        }
        return config.rate0;
    }

    /// @notice distribute TAKE token to partipant according to Takepile distribution rate (if distribution enabled)
    /// @notice this will be called by all TakeToken contracts on position exit
    /// @notice will distribute until contract balance is exhausted
    /// @notice if distribution amount greater than contract balance, will transfer remaining balance
    /// @param participant the participant to distribute for
    /// @param positionAmount the amount of pile token staked on the position
    /// @param periods the number of periods (seconds) to distribute on
    function distributeTakeFromTakepile(
        address participant,
        uint256 positionAmount,
        uint256 periods
    ) external override onlyTakepile {
        TakepileConfig memory _config = takepileConfig[msg.sender];
        uint256 balance = ERC20(TAKE).balanceOf(address(this));
        if (balance > 0 && _config.distributionRate > 0) {
            uint256 distribution = this.calculateDistribution(
                _config.distributionRate,
                positionAmount,
                periods
            );
            ERC20(address(TAKE)).safeTransfer(
                participant,
                distribution <= balance ? distribution : balance
            );
        }
    }

    /// @notice distribute TAKE token to partipant according to vault distribution rate
    /// @notice this will be called when claiming rewards for a staked vault position
    /// @notice will distribute until contract balance is exhausted
    /// @notice if distribution amount greater than contract balance, will transfer remaining balance
    /// @param participant the participant to distribute for
    /// @param positionAmount the amount of pile token staked on the position
    /// @param periods the number of periods (seconds) to distribute on
    function distributeTakeFromVault(
        address participant,
        uint256 positionAmount,
        uint256 periods,
        uint256 lockup
    ) external override onlyVault {
        uint256 balance = ERC20(TAKE).balanceOf(address(this));
        uint256 rate = getVaultDistributionRate(msg.sender, lockup);
        if (balance > 0 && rate > 0) {
            uint256 distribution = calculateDistribution(rate, positionAmount, periods);
            ERC20(address(TAKE)).safeTransfer(
                participant,
                distribution <= balance ? distribution : balance
            );
        }
    }

    /// @notice calculate the amount of TAKE that should be distributed since last distribution
    /// @param distributionRate the distribution rate of the takepile, scaled by 1e27
    /// @param positionAmount the size of the position to distribute on
    /// @param periods the number of periods (seconds) to distribute on
    function calculateDistribution(
        uint256 distributionRate,
        uint256 positionAmount,
        uint256 periods
    ) public view override returns (uint256) {
        require(positionAmount > 0, "Takepile: amount cannot be zero");
        return this.calculateSimpleInterest(positionAmount, distributionRate, periods);
    }

    /// @notice calculate simple interest
    /// @param p the principal
    /// @param r the rate per time period (scaled by 1e27)
    /// @param t the number of time periods
    /// @return the simple interest
    function calculateSimpleInterest(
        uint256 p,
        uint256 r, // r scaled by 1e27
        uint256 t
    ) external pure override returns (uint256) {
        return p.mul(r.mul(t)).div(1e27);
    }

    /// @notice calculate the reward of a position closing
    /// @param amount the position size, i.e. the amount of pileTokens staked on trade
    /// @param entryPrice the position's entry price
    /// @param currentPrice the position's current market price
    /// @param isLong true if long position, false if short position
    function calculateReward(
        uint256 amount,
        int256 entryPrice,
        int256 currentPrice,
        bool isLong
    ) external pure override returns (int256) {
        if (amount == 0) {
            return 0;
        }
        int256 diff = currentPrice - entryPrice;
        int256 reward = (int256(amount) * (diff)) / entryPrice;
        reward = isLong ? reward : -reward;
        return reward;
    }

    /// @dev get conversion between underlying and shares (one parameter must be non-zero)
    /// @param _underlying the amount of underlying to convert to shares
    /// @param _shares the amount of shares to convert to underlying
    function getConversion(
        uint256 _underlying,
        uint256 _shares,
        uint256 _underlyingSupply,
        uint256 _totalShares
    ) public pure override returns (uint256) {
        require(_underlying == 0 || _shares == 0, "Takepile: one value should be zero");
        require(_underlying > 0 || _shares > 0, "Takepile: one value should be non-zero");
        // Converting underlying to shares
        if (_underlying > 0) {
            if (_totalShares == 0 || _underlyingSupply == 0) {
                return _underlying;
            }
            return (_totalShares * _underlying) / _underlyingSupply;
            // Converting shares to underlying
        } else {
            if (_totalShares == 0 || _underlyingSupply == 0) {
                return _shares;
            }
            return (_underlyingSupply * _shares) / _totalShares;
        }
    }

    /// @notice validate position amount; revert if amount exceeds takepile maximum amount (relative),
    ///         or is below minimum amount (absolute)
    function validatePositionAmount(
        address _takepile,
        address who,
        uint256 amount
    ) external view override {
        TakepileConfig memory config = takepileConfig[_takepile];
        require(config.maximumAmountDivisor > 0, "Takepile: takepile does not exist");
        require(
            ERC20(TAKE).balanceOf(who) >= config.takeRequirement,
            "Takepile: TAKE requirement not met"
        );
        TakepileToken takepile = TakepileToken(_takepile);
        require(
            amount < takepile.totalSupply() / config.maximumAmountDivisor,
            "Takepile: position amount exceeds maximum"
        );
        require(amount >= config.minimumAmount, "Takepile: position amount below minimum");
    }

    /// @notice validate if position has been open long enough to be applicable for rewards
    /// @param _takepile the address of the takpile
    /// @param entryTime the time the position was opened
    /// @return bool true if position should be rewarded, false otherwise
    function validatePositionDuration(address _takepile, uint256 entryTime)
        external
        view
        override
        returns (bool)
    {
        TakepileConfig memory config = takepileConfig[_takepile];
        if (block.timestamp >= entryTime + config.minimumDuration) {
            return true;
        }
        return false;
    }

    /// @notice revert if minimum deposit duration not met
    function validateDepositDuration(address _takepile, uint256 depositTime)
        external
        view
        override
    {
        TakepileConfig memory config = takepileConfig[_takepile];
        require(
            block.timestamp >= depositTime + config.minimumDepositDuration,
            "Takepile: minimum deposit time not met"
        );
    }

    /// @notice revert if address does not have at least one liquidation pass
    /// @param liquidator the address to check
    function validateLiquidator(address liquidator) external view override {
        require(
            IERC721(liquidationPass).balanceOf(liquidator) > 0,
            "Takepile: liquidation blocked"
        );
    }
}
