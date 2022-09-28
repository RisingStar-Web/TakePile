


const { network } = require("hardhat");

module.exports = async function moveTime(amount) {
  await network.provider.send("evm_increaseTime", [amount])
  console.log(`Moved forward in time ${amount} seconds`)
}