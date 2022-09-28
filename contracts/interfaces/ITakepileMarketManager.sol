// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface ITakepileMarketManager {
    function addMarket(
        string memory symbol,
        address priceConsumer,
        address priceFeed
    ) external;

    function removeMarket(string memory symbol) external;

    function getLatestPrice(string memory symbol) external view returns (int256);
}
