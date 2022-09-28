//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./TakepileMarketManager.sol";
import "./interfaces/IPriceConsumer.sol";
import "./interfaces/IxTake.sol";
import "./interfaces/IxTakeFactory.sol";
import "./interfaces/ITakepileToken.sol";
import "./TakepileDriver.sol";

/// @title TakepileToken
/// @notice responsible for entering/exiting positions, limit orders, position health, and liquidations
contract TakepileToken is ERC20, TakepileMarketManager, ITakepileToken {
    using Address for address;
    using SafeERC20 for ERC20;

    /// @notice Takepile V1
    uint256 public version = 1;

    /// @notice the Takepile's underlying ERC-20 token
    address public underlying;

    /// @notice the Takepile's driver contract
    address public driver;

    /// @notice the Takepile's distribution contract
    address public distributor;

    /// @notice the max leverage someone can use on a position
    /// @notice leverage is determined by calculating the ratio between position amount and collateral
    uint256 public maxLeverage; // The max leverage someone can use on a position

    /// @notice the address that last triggered a liquidation
    address public lastLiquidator;

    struct Position {
        string symbol; // the market symbol
        uint256 amount; // the total position size
        uint256 collateral; // the amount of collateral staked on the trade
        int256 price; // the position's entry price
        bool isLong; // true if long, false if short
        uint256 timestamp; // position creation time
        uint256 lastUpdated; // the last time this position was updated
    }

    struct LimitOrder {
        string symbol; // the market symbol
        uint256 amount; // the total position size for the order
        uint256 collateral; // the collateral staked on the order
        bool isLong; // true if long order, false if short order
        bool isIncrease; // true if increase, false if decrease
        bool isActive; // true if untriggered, false if triggered or cancelled
        uint256 limitPrice; // (increase only) the price at which the order should trigger
        uint256 stopLoss; // (decrease only) the price below current price at which decrease should
        uint256 takeProfit; // (decrease only) the price above current price at which decrease should
        uint256 timestamp; // the time order was submitted
        uint256 deadline; // the date at which this order becomes invalid (untriggerable)
        uint256 lastUpdated; // the last time this order was updated
    }

    /// @notice address -> market --> position
    /// @notice address can only have one position in each market at a time
    mapping(address => mapping(string => Position)) public positions;

    /// @notice address -> market --> limit orders
    /// @notice address can have multiple limit orders in each market at a time
    mapping(address => mapping(string => LimitOrder[])) public limitOrders;

    /// @notice address -> amount of pileToken already transferred to contract waiting for position
    mapping(address => uint256) private tempBalances;

    /// @notice track last deposit per address
    mapping(address => uint256) private lastDeposit;

    event Deposit(address indexed who, uint256 _underlying, uint256 _shares);
    event Withdraw(address indexed who, uint256 _underlying, uint256 _shares);
    event SupplyUpdate(uint256 _underlying, uint256 _shares);
    event IncreasePosition(
        address indexed who,
        string symbol,
        uint256 amount,
        uint256 newAmount,
        bool isLong,
        int256 price,
        uint256 fees
    );
    event DecreasePosition(
        address indexed who,
        string symbol,
        uint256 amount,
        uint256 newAmount,
        bool isLong,
        int256 price,
        int256 reward,
        uint256 fees
    );
    // TODO Bug: decrease limit orders have no way of specifying stop loss and take profit here
    // limitPrice is takeProfit for decreasePositions
    // stopLoss is 0 for increasePositions
    event LimitOrderSubmitted(
        address indexed who,
        string symbol,
        uint256 amount,
        uint256 collateral,
        bool isLong,
        uint256 limitPrice,
        uint256 stopLoss,
        uint256 index,
        uint256 deadline
    );
    event LimitOrderCancelled(address indexed who, string symbol, uint256 index);
    event LimitOrderTriggered(address indexed who, string symbol, uint256 index, address by);

    constructor(
        address _driver,
        address _xTakeFactory,
        address _underlying,
        string memory _name,
        string memory _symbol,
        uint256 _maxLeverage
    ) ERC20(_name, _symbol) {
        driver = _driver;
        underlying = _underlying;
        maxLeverage = _maxLeverage;

        // Initialize xTake fee distributor
        distributor = IxTakeFactory(_xTakeFactory).createDistributor(
            TakepileDriver(_driver).TAKE(),
            address(this),
            _symbol
        );
    }

    /// @dev get conversion between underlying and shares (one parameter must be non-zero)
    /// @param _underlying the amount of underlying to convert to shares
    /// @param _shares the amount of shares to convert to underlying
    function getConversion(uint256 _underlying, uint256 _shares)
        public
        view
        override
        returns (uint256)
    {
        return
            TakepileDriver(driver).getConversion(
                _underlying,
                _shares,
                ERC20(underlying).balanceOf(address(this)),
                this.totalSupply()
            );
    }

    /// @dev supply underlying in exchange for shares
    /// @dev shares will be minted according to the current exchange rate
    /// @param amount the amount of underlying to deposit into the Takepile
    function deposit(uint256 amount) external override {
        require(amount > 0, "Takepile: amount cannot be zero");

        // Track last deposit time
        lastDeposit[msg.sender] = block.timestamp;

        // Get amount to mint by calculating exchange for underlying
        uint256 mintAmount = getConversion(amount, 0);
        ERC20(underlying).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, mintAmount);

        emit Deposit(msg.sender, amount, mintAmount);
    }

    /// @dev withdraw shares in exchange for underlying (shares will be burned)
    /// @param amount the amount of shares to withdraw from the Takepile in exchange for underlying
    function withdraw(uint256 amount) external override {
        require(amount > 0, "Takepile: amount cannot be zero");

        uint256 shares = balanceOf(msg.sender);
        require(shares >= amount, "Takepile: insufficient balance");

        // Ensure last deposit was greater than minimum deposit duration
        TakepileDriver(driver).validateDepositDuration(address(this), lastDeposit[msg.sender]);

        // Get amount to transfer by calculating underying exchange for shares
        uint256 transferAmount = getConversion(0, amount);
        _burn(msg.sender, amount);
        ERC20(underlying).safeTransfer(msg.sender, transferAmount);

        emit Withdraw(msg.sender, transferAmount, amount);
    }

    /// @notice take fees from amount
    /// @param amount the order amount to take fees from
    /// @param isLimitOrder true if limit order, false otherwise
    /// @param triggerer the address that triggered the limit order; only applies when isLimitOrder is true
    function takeFees(
        uint256 amount,
        bool isLimitOrder,
        address triggerer
    ) internal returns (uint256) {
        (
            uint256 burnFeeDivisor,
            uint256 treasuryFeeDivisor,
            uint256 distributionFeeDivisor,
            uint256 limitFeeDivisor
        ) = TakepileDriver(driver).getTakepileFeeDivisors(address(this));

        uint256 burnFee = burnFeeDivisor > 0 ? amount / burnFeeDivisor : 0;
        uint256 treasuryFee = treasuryFeeDivisor > 0 ? amount / treasuryFeeDivisor : 0;
        uint256 distributionFee = distributionFeeDivisor > 0 ? amount / distributionFeeDivisor : 0;
        uint256 limitFee;

        _burn(address(this), burnFee);

        // Transfer treasuryFee to treasury
        this.transfer(TakepileDriver(driver).treasury(), treasuryFee);

        if (distributionFee > 0) {
            IERC20(address(this)).approve(distributor, distributionFee);
            IxTake(distributor).distribute(distributionFee);
        }

        if (isLimitOrder) {
            limitFee = limitFeeDivisor > 0 ? amount / limitFeeDivisor : 0;
            this.transfer(address(triggerer), limitFee);
        }

        return amount - burnFee - treasuryFee - distributionFee - limitFee;
    }

    /// @notice increase an existing position
    /// @notice assumes transfer has already taken place!
    /// @param who the address to increase position for
    /// @param symbol the market symbol to increase position for
    /// @param amount the pile token amount to increase position by
    /// @param collateral the amount of collateral to add to position
    /// @param isLong true if long, false otherwise
    /// @param isLimitOrder true if limit order, false otherwise
    /// @param triggerer the address that triggered the limit order
    function increasePosition(
        address who,
        string memory symbol,
        uint256 amount,
        uint256 collateral,
        bool isLong,
        bool isLimitOrder,
        address triggerer
    ) internal {
        int256 currentPrice = this.getLatestPrice(symbol);
        Position storage position = positions[who][symbol];

        // Take from user's balance
        tempBalances[who] -= amount;

        uint256 amountMinusFees = takeFees(amount, isLimitOrder, triggerer);
        uint256 fees = amount - amountMinusFees;
        uint256 collateralMinusFees = collateral - fees;

        if (position.amount > 0) {
            require(position.isLong == isLong, "Takepile: conflicting directions");

            // Distribute TAKE here on original collateral amount before position.lastUpdated is set
            bool isRewardable = TakepileDriver(driver).validatePositionDuration(
                address(this),
                position.timestamp
            );
            if (isRewardable) {
                TakepileDriver(driver).distributeTakeFromTakepile(
                    who,
                    collateral,
                    block.timestamp - position.lastUpdated
                );
            }

            // update entry price and amount
            position.price =
                ((currentPrice * int256(amountMinusFees)) +
                    (position.price * int256(position.amount))) /
                int256(amountMinusFees + position.amount);
            position.amount += amountMinusFees;
            position.collateral += collateralMinusFees;
            position.lastUpdated = block.timestamp;
        } else {
            // create the position
            positions[who][symbol] = Position(
                symbol,
                amountMinusFees,
                collateralMinusFees,
                currentPrice,
                isLong,
                block.timestamp,
                block.timestamp
            );
        }

        require(
            (position.amount * 1e18) / position.collateral <= maxLeverage * 1e18,
            "Takepile: maximum leverage exceeded"
        );

        TakepileDriver(driver).validatePositionAmount(address(this), who, position.amount);

        emit IncreasePosition(who, symbol, amount, position.amount, isLong, currentPrice, fees);
    }

    /// @notice decrease an existing position
    /// @param who the address to decrease position for
    /// @param symbol the market symbol to decrease position for
    /// @param amount the pile token amount to decrease position by
    /// @param isLimitOrder true if order is a limit order, false otherwise
    /// @param triggerer the address that triggered the limit order
    function decreasePosition(
        address who,
        string memory symbol,
        uint256 amount,
        uint256 collateral,
        bool isLimitOrder,
        address triggerer
    ) internal {
        Position storage position = positions[who][symbol];
        require(position.amount > 0, "Takepile: position does not exist");

        // If decrease by more than position/collateral amount, set to max amount
        if (amount > position.amount) {
            amount = position.amount;
        }
        if (collateral > position.collateral) {
            collateral = position.collateral;
        }

        int256 price = this.getLatestPrice(symbol);
        int256 reward = TakepileDriver(driver).calculateReward(
            amount,
            position.price,
            price,
            position.isLong
        );

        // Check if position has been opened for sufficient duration to receive rewards
        bool isRewardable = TakepileDriver(driver).validatePositionDuration(
            address(this),
            position.timestamp
        );

        // If position has a positive reward but not rewardable, set to 0
        if (!isRewardable && reward > 0) {
            reward = 0;
        }

        // NOTE: cannot safely cast negative int to uint
        uint256 exitAmount = reward >= 0 ? amount + uint256(reward) : amount - uint256(-reward);
        uint256 exitAmountAfterFees = takeFees(exitAmount, isLimitOrder, triggerer);
        uint256 fees = exitAmount - exitAmountAfterFees;

        position.amount -= amount;
        position.collateral -= collateral;

        if (position.amount > 0) {
            require(position.collateral > 0, "Takepile: no collateral left");
            require(
                (position.amount * 1e18) / position.collateral <= maxLeverage * 1e18,
                "Takepile: maximum leverage exceeded"
            );
        } else {
            require(position.collateral == 0, "Takepile: collateral leftover");
        }

        // Call Driver for TAKE distribution
        if (isRewardable) {
            TakepileDriver(driver).distributeTakeFromTakepile(
                who,
                collateral,
                block.timestamp - position.lastUpdated
            );
        }
        position.lastUpdated = block.timestamp;

        // Transfer before burning to ensure there's enough to burn
        this.transfer(who, collateral - fees);

        if (reward > 0) {
            _mint(who, uint256(reward));
        } else {
            uint256 burnAmount = uint256(-reward);
            // If loss is greater than exit collateral, burn all transferred collateral
            // This should happen rarely, since the position has to be liquidatable for this to occur
            if (burnAmount > collateral - fees) {
                _burn(who, collateral - fees);
            } else {
                _burn(who, burnAmount);
            }
        }

        if (position.amount == 0) {
            delete positions[msg.sender][symbol];
        } else {
            TakepileDriver(driver).validatePositionAmount(address(this), who, position.amount);
        }

        emit DecreasePosition(
            who,
            symbol,
            amount,
            position.amount,
            position.isLong,
            price,
            reward,
            fees
        );
        emit SupplyUpdate(ERC20(underlying).balanceOf(address(this)), this.totalSupply());
    }

    /// @notice enter a position
    /// @notice can only one position per market
    /// @param symbol the market symbol to enter position on
    /// @param amount the amount of pileToken to stake on the position
    /// @param isLong true for long, false for short
    function placeMarketIncrease(
        string memory symbol,
        uint256 amount,
        uint256 collateral,
        bool isLong
    ) external override {
        require(this.balanceOf(msg.sender) >= collateral, "Takepile: insufficient balance");
        require(collateral > 0, "Takepile: collateral cannot be zero");

        this.transferFrom(msg.sender, address(this), collateral);
        tempBalances[msg.sender] += amount;

        return increasePosition(msg.sender, symbol, amount, collateral, isLong, false, address(0));
    }

    /// @notice exit a position
    /// @notice calls driver function to distribute TAKE based (if Takepile distribution rate set)
    /// @param symbol the symbol of the position to close
    function placeMarketDecrease(
        string memory symbol,
        uint256 amount,
        uint256 collateral
    ) external override {
        return decreasePosition(msg.sender, symbol, amount, collateral, false, address(0));
    }

    /// @notice place limit entry order
    /// @param symbol the market symbol
    /// @param amount the amount of pileTokens to stake on trade
    /// @param isLong true if long, false if short
    /// @param limitPrice the entry threshold
    /// @param deadline the timestamp at wich this order is no longer considered valid
    function placeLimitIncrease(
        string memory symbol,
        uint256 amount,
        uint256 collateral,
        bool isLong,
        uint256 limitPrice,
        uint256 deadline
    ) external override {
        require(amount > 0, "Takepile: amount cannot be zero");
        require(deadline > block.timestamp, "Takepile: order expired");
        require(this.balanceOf(msg.sender) >= collateral, "Takepile: insufficient balance");

        this.transferFrom(msg.sender, address(this), collateral);

        tempBalances[msg.sender] += amount;

        int256 price = this.getLatestPrice(symbol);
        if (isLong) {
            require(price > int256(limitPrice), "Takepile: long order would trigger immediately");
        } else {
            require(price < int256(limitPrice), "Takepile: short order would trigger immediately");
        }

        LimitOrder[] storage orders = limitOrders[msg.sender][symbol];

        orders.push(
            LimitOrder(
                symbol,
                amount,
                collateral,
                isLong,
                true,
                true,
                limitPrice,
                0,
                0,
                block.timestamp,
                deadline,
                block.timestamp
            )
        );

        emit LimitOrderSubmitted(
            msg.sender,
            symbol,
            amount,
            collateral,
            isLong,
            limitPrice,
            0,
            orders.length - 1,
            deadline
        );
    }

    /// @notice place limit order to decrease existing position
    /// @param symbol the market symbol
    /// @param amount the amount of pileTokens to stake on trade
    /// @param stopLoss the low exit threshold
    /// @param takeProfit the high exit threshold
    /// @param deadline the timestamp at wich this order is no longer considered valid
    function placeLimitDecrease(
        string calldata symbol,
        uint256 amount,
        uint256 collateral,
        uint256 stopLoss,
        uint256 takeProfit,
        uint256 deadline
    ) external override {
        require(deadline > block.timestamp, "Takepile: order expired");
        Position memory position = positions[msg.sender][symbol];
        require(position.amount > 0, "Takepile: position does not exist");

        uint256 price = uint256(this.getLatestPrice(symbol));
        if (position.isLong) {
            require(
                price > stopLoss && price < takeProfit,
                "Takepile: order would trigger immediately"
            );
        } else {
            require(
                price < stopLoss && price > takeProfit,
                "Takepile: order would trigger immediately"
            );
        }

        LimitOrder[] storage orders = limitOrders[msg.sender][symbol];

        orders.push(
            LimitOrder(
                symbol,
                amount,
                collateral,
                position.isLong,
                false,
                true,
                0,
                stopLoss,
                takeProfit,
                block.timestamp,
                deadline,
                block.timestamp
            )
        );

        emit LimitOrderSubmitted(
            msg.sender,
            symbol,
            amount,
            collateral,
            position.isLong,
            takeProfit,
            stopLoss,
            orders.length - 1,
            deadline
        );
    }

    /// @notice cancel limit order
    /// @notice fees are not taken on cancelled limit orders
    /// @param symbol the limit order to cancel
    function cancelLimitOrder(string calldata symbol, uint256 index) external override {
        LimitOrder storage limitOrder = limitOrders[msg.sender][symbol][index];
        require(limitOrder.amount > 0, "Takepile: order does not exist");
        require(limitOrder.isActive, "Takepile: order inactive");
        limitOrder.isActive = false;
        limitOrder.lastUpdated = block.timestamp;
        if (limitOrder.isIncrease) {
            tempBalances[msg.sender] -= limitOrder.amount;
            this.transfer(msg.sender, limitOrder.collateral);
        }
        emit LimitOrderCancelled(msg.sender, symbol, index);
    }

    /// @notice trigger a limit order
    /// @param who the address to trigger limit order for
    /// @param symbol the symbol to trigger limit order for
    function triggerLimitOrder(
        address who,
        string calldata symbol,
        uint256 index
    ) external override {
        require(limitOrders[who][symbol].length > 0, "Takepile: order does not exist");
        LimitOrder storage limitOrder = limitOrders[who][symbol][index];
        require(limitOrder.amount > 0, "Takepile: order does not exist");
        require(limitOrder.isActive, "Takepile: order inactive");
        int256 price = this.getLatestPrice(limitOrder.symbol);

        limitOrder.isActive = false;
        limitOrder.lastUpdated = block.timestamp;

        if (limitOrder.isIncrease) {
            if (limitOrder.isLong) {
                require(
                    uint256(price) <= limitOrder.limitPrice,
                    "Takepile: conditions not satisfied"
                );
            } else {
                require(
                    uint256(price) >= limitOrder.limitPrice,
                    "Takepile: conditions not satisfied"
                );
            }
            increasePosition(
                who,
                symbol,
                limitOrder.amount,
                limitOrder.collateral,
                limitOrder.isLong,
                true,
                msg.sender
            );
        } else {
            if (limitOrder.isLong) {
                require(
                    uint256(price) <= limitOrder.stopLoss ||
                        uint256(price) >= limitOrder.takeProfit,
                    "Takepile: conditions not satisfied"
                );
            } else {
                require(
                    uint256(price) >= limitOrder.stopLoss ||
                        uint256(price) <= limitOrder.takeProfit,
                    "Takepile: conditions not satisfied"
                );
            }
            decreasePosition(
                who,
                symbol,
                limitOrder.amount,
                limitOrder.collateral,
                true,
                msg.sender
            );
        }
        emit LimitOrderTriggered(who, symbol, index, msg.sender);
    }

    /// @notice Get health factor for a position
    /// @param who the address to check
    /// @param symbol the position symbol to check
    /// @return factor the position health factor; if greater than 1e18, position is at risk of liquidation
    function getHealthFactor(address who, string calldata symbol)
        external
        view
        override
        returns (int256)
    {
        Position memory position = positions[who][symbol];
        if (position.amount == 0) return 0;
        int256 leverage = (int256(position.amount) * 1e18) / int256(position.collateral);
        int256 price = this.getLatestPrice(symbol);
        int256 factor = ((position.price - price) * leverage) / position.price;
        return position.isLong ? factor : -factor;
    }

    /// @notice liquidate an unhealthy position
    /// @notice liquidator and treasury will receive the same reward (taken from config in driver)
    /// @notice any amount not rewarded is burned
    /// @param who the address with position to liquidate
    /// @param symbol the symbol to liquidate
    function liquidate(address who, string calldata symbol) external override {
        Position storage position = positions[who][symbol];
        require(position.amount > 0, "Takepile: position does not exist");
        require(this.getHealthFactor(who, symbol) > 1e18, "Takepile: position is not liquidatable");

        // Ensure liquidator has a liquidation pass
        TakepileDriver(driver).validateLiquidator(msg.sender);

        // Ensure same liquidator does not trigger back-to-back liquidations
        require(lastLiquidator != msg.sender, "Takepile: cannot trigger back-to-back liquidations");

        uint256 divisor = TakepileDriver(driver).getTakepileLiquidationRewardDivisor(address(this));
        uint256 rewardAmount = divisor > 0 ? position.collateral / divisor : 0;
        uint256 burnAmount = position.collateral - rewardAmount - rewardAmount;
        uint256 amount = position.amount;

        position.amount = 0;
        position.collateral = 0;
        position.lastUpdated = block.timestamp;

        // Set last liquidator
        lastLiquidator = msg.sender;

        // Transfer reward to liquidator
        this.transfer(msg.sender, rewardAmount);

        // Transfer treasuryAmount to treasury
        this.transfer(TakepileDriver(driver).treasury(), rewardAmount);

        // Burn the rest
        _burn(address(this), burnAmount);

        emit SupplyUpdate(ERC20(underlying).balanceOf(address(this)), this.totalSupply());
        emit DecreasePosition(
            who,
            symbol,
            amount,
            0,
            position.isLong,
            this.getLatestPrice(symbol),
            -int256(amount),
            amount
        );
    }
}
