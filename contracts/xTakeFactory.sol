//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

// import "@openzeppelin/contracts/access/Ownable.sol";
import "./xTake.sol";
import "./interfaces/IxTakeFactory.sol";

/// @title xTakeFactory Contract
/// @notice responsible for creation of new xTake fee distribution contracts
contract xTakeFactory is IxTakeFactory {

    /// @notice Create a new xTake distributor contract and transfer ownership to sender
    function createDistributor(address _TAKE, address _pile, string calldata _symbol)
        external
        override
        returns(address)
    {
        xTake x = new xTake(_TAKE, _pile, _symbol);
        x.transferOwnership(msg.sender);
        return address(x);
    }
}
