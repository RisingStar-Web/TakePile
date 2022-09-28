// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "./interfaces/IPriceConsumer.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract ChainlinkPriceConsumer is IPriceConsumer {
    /// @notice Returns the latest price
    /// @param oracle the address of the price feed to fetch price for
    function getLatestPrice(address oracle) public view override returns (int256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(oracle);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return price;
    }
}
