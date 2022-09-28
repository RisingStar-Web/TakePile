// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface ITakepileFactory {
    function createTakepile(
        address driver,
        address _xTakeFactory,
        address underlying,
        string calldata name,
        string calldata symbol,
        uint256 maxLeverage
    ) external returns (address);
}
