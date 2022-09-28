// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface ITakepileToken {
    function getConversion(uint256 _underlying, uint256 _shares) external view returns (uint256);

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function placeMarketIncrease(
        string memory symbol,
        uint256 amount,
        uint256 collateral,
        bool isLong
    ) external;

    function placeMarketDecrease(
        string memory symbol,
        uint256 amount,
        uint256 collateral
    ) external;

    function placeLimitIncrease(
        string memory symbol,
        uint256 amount,
        uint256 collateral,
        bool isLong,
        uint256 limitPrice,
        uint256 deadline
    ) external;

    function placeLimitDecrease(
        string calldata symbol,
        uint256 amount,
        uint256 collateral,
        uint256 stopLoss,
        uint256 takeProfit,
        uint256 deadline
    ) external;

    function cancelLimitOrder(string calldata symbol, uint256 index) external;

    function triggerLimitOrder(
        address who,
        string calldata symbol,
        uint256 index
    ) external;

    function getHealthFactor(address who, string calldata symbol) external view returns (int256);

    function liquidate(address who, string calldata symbol) external;
}
