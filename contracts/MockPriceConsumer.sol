// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./interfaces/IPriceConsumer.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockPriceConsumer is IPriceConsumer {
    mapping(address => int256) public prices;

    /// @notice Get latest price from mock oracle
    /// @param oracle the address of the price feed to get price for
    function getLatestPrice(address oracle) public view override returns (int256) {
        return prices[oracle];
    }

    /// @notice set mock oracle price
    /// @param oracle oracle the address of the price feed to set price for
    /// @param mockPrice the mock price
    function setPrice(address oracle, int256 mockPrice) public {
        prices[oracle] = mockPrice;
    }
}
