// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

interface IxTakeFactory {
    
    function createDistributor(address _TAKE, address _pile, string calldata _symbol) external returns(address);

}
