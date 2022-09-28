// SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPriceConsumer.sol";
import "./interfaces/ITakepileMarketManager.sol";

/// @title TakepileMarketManager
/// @notice responsible for adding/removing markets, and fetching prices from market
contract TakepileMarketManager is Ownable, ITakepileMarketManager {
    struct Market {
        string symbol;
        address priceConsumer;
        address priceFeed;
    }

    mapping(string => Market) public markets; // symbol -> market

    event AddMarket(string symbol, address priceConsumer, address priceFeed);
    event RemoveMarket(string symbol);

    /// @dev Add (or update) market on a Takepile
    /// @dev Currently limited to owner, eventually will be limited to governance contract
    /// @param symbol the symbol of the market to add
    /// @param priceConsumer the address of the priceConsumer contract this market should use
    /// @param priceFeed the address the priceConsumer will get the latest price from
    function addMarket(
        string memory symbol,
        address priceConsumer,
        address priceFeed
    ) public override onlyOwner {
        Market memory market = Market(symbol, priceConsumer, priceFeed);
        markets[symbol] = market;
        emit AddMarket(symbol, priceConsumer, priceFeed);
    }

    /// @dev remove market from a Takepile
    /// @dev Currently limited to owner, eventually will be limited to governance contract
    /// @param symbol the symbol of the market to remove
    function removeMarket(string memory symbol) public override onlyOwner {
        require(markets[symbol].priceConsumer != address(0), "Takepile: market does not exist");
        delete markets[symbol];
        emit RemoveMarket(symbol);
    }

    /// @dev get latest price for market; will revert if market does not exist
    /// @param symbol the symbol to fetch price for
    /// @return the latest price for the market
    function getLatestPrice(string memory symbol) external view override returns (int256) {
        Market memory market = markets[symbol];
        require(market.priceConsumer != address(0), "Takepile: market does not exist");
        return IPriceConsumer(market.priceConsumer).getLatestPrice(market.priceFeed);
    }
}
