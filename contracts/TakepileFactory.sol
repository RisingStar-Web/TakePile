//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ITakepileFactory.sol";
import "./TakepileToken.sol";

/// @title TakepileFactory Contract
/// @notice responsible for creation of new takepiles
contract TakepileFactory is ITakepileFactory, Ownable {
    /// @notice Create a new Takepile and transfer ownership to sender
    function createTakepile(
        address driver,
        address _xTakeFactory,
        address underlying,
        string calldata name,
        string calldata symbol,
        uint256 maxLeverage
    ) external override onlyOwner returns (address) {
        TakepileToken takepile = new TakepileToken(
            driver,
            _xTakeFactory,
            underlying,
            name,
            symbol,
            maxLeverage
        );
        takepile.transferOwnership(msg.sender);
        return address(takepile);
    }
}
