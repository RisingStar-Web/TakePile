// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { utils } = require("ethers");
const { ethers } = require("hardhat");
const hre = require("hardhat");

const deployment = require('./deployment.json');

async function main() {
  await hre.run("compile");

  const [owner] = await ethers.getSigners();
  const [ownerAddr] = await Promise.all([owner].map((x) => x.getAddress()));

  const driver = await ethers.getContractAt(
    "TakepileDriver",
    deployment.takepileDriver
  );

  const mockPriceConsumer = await ethers.getContractAt("MockPriceConsumer", '0x20F5f955B0AD38fB24910B1dB3e8c6d7f3Be19BA');
  console.log("MockPriceConsumer:", mockPriceConsumer.address);


  const pileToken = await ethers.getContractAt(
    "TakepileToken",
    await driver.takepiles(4)
  );
  console.log(`pileTEST100x`, pileToken.address);

  await mockPriceConsumer.setPrice('0x6d5689Ad4C1806D1BA0c70Ab95ebe0Da6B204fC5', utils.parseUnits('10', 8));
  // 
  // let tx = await pileToken.addMarket(
  //   'LINKUSD',
  //   mockPriceConsumer.address,
  //   '0x6d5689Ad4C1806D1BA0c70Ab95ebe0Da6B204fC5'
  // );

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
