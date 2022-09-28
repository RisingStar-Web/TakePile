


const { network } = require("hardhat");

module.exports = async function moveBlocks(amount) {
  for (let index = 0; index < amount; index++) {
    await network.provider.request({
      method: "evm_mine",
      params: [],
    })
  }
  console.log(`Moved ${amount} blocks forward`)
}