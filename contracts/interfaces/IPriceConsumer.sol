// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IPriceConsumer {
    function getLatestPrice(address oracle) external view returns (int256);
}
