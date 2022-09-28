// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface ITakepileDriver {
    function createTakepile(
        address underlying,
        string calldata name,
        string calldata symbol,
        uint256 maxLeverage
    ) external;

    function createVault(string memory name, address token) external;

    function updateTakepileFactory(address _takepileFactory) external;

    function updateDistributorFactory(address _distributorFactory) external;

    function setTakepileDistributionRate(address takepile, uint256 rate) external;

    function setTakepileFeeDivisors(
        address takepile,
        uint256 burnFeeDivisor,
        uint256 treasuryFeeDivisor,
        uint256 distributionFeeDivisor,
        uint256 limitFeeDivisor
    ) external;

    function getTakepileFeeDivisors(address takepile)
        external
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        );

    function setTakepileLiquidationRewardDivisor(address takepile, uint256 liquidationRewardDivisor)
        external;

    function getTakepileLiquidationRewardDivisor(address takepile) external view returns (uint256);

    function setTakepileAmountParameters(
        address takepile,
        uint256 maximumAmountDivisor,
        uint256 minimumAmount
    ) external;

    function setTakepileMinimumDuration(address takepile, uint256 minimumDuration) external;

    function setTakepileMinimumDepositDuration(address takepile, uint256 minimumDuration) external;

    function setTakepileTakeRequirement(address takepile, uint256 takeRequirement) external;

    function setVaultDistributionRates(
        address takepile,
        uint256 baseRate,
        uint256 boost1,
        uint256 boost2,
        uint256 boost3
    ) external;

    function getVaultDistributionRate(address vault, uint256 lockup) external returns (uint256);

    function distributeTakeFromTakepile(
        address participant,
        uint256 positionAmount,
        uint256 periods
    ) external;

    function distributeTakeFromVault(
        address participant,
        uint256 positionAmount,
        uint256 periods,
        uint256 lockup
    ) external;

    function calculateDistribution(
        uint256 distributionRate,
        uint256 positionAmount,
        uint256 periods
    ) external view returns (uint256);

    function calculateSimpleInterest(
        uint256 p,
        uint256 r, // r scaled by 1e27
        uint256 t
    ) external pure returns (uint256);

    function calculateReward(
        uint256 amount,
        int256 entryPrice,
        int256 currentPrice,
        bool isLong
    ) external pure returns (int256);

    function getConversion(
        uint256 _underlying,
        uint256 _shares,
        uint256 _underlyingSupply,
        uint256 _totalShares
    ) external pure returns (uint256);

    function validatePositionAmount(
        address _takepile,
        address who,
        uint256 amount
    ) external view;

    function validatePositionDuration(address _takepile, uint256 entryTime)
        external
        view
        returns (bool);

    function validateDepositDuration(address _takepile, uint256 depositTime) external view;

    function validateLiquidator(address liquidator) external view;
}
