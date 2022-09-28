// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers } = require("hardhat");
const hre = require("hardhat");
const fs = require('fs');

async function main() {
  await hre.run("compile");

  const [owner] = await ethers.getSigners();
  const [ownerAddr] = await Promise.all([owner].map((x) => x.getAddress()));

  console.log(`Deployer Address: ${ownerAddr}`);

  const treasuryAddr = '0x1B4E80C6A4Ab6Aab3B945B1A2205F8399880f832';

  const TestToken = await ethers.getContractFactory("TestToken");
  const underlyingToken = await TestToken.deploy(
    "TestToken",
    "TEST",
    ethers.utils.parseUnits("100000000", 18).toString()
  );
  await underlyingToken.deployed();
  console.log("TestToken:", underlyingToken.address);

  const LiquidationPass = await ethers.getContractFactory("LiquidationPass");
  liquidationPass = await LiquidationPass.deploy("https://takepile.com/liquidation-pass.gif");
  await liquidationPass.deployed();

  const takeToken = await TestToken.deploy("Takepile", "TAKE", ethers.utils.parseUnits("100000000", 18).toString());
  await takeToken.deployed();
  console.log("TAKE", takeToken.address);

  const ChainlinkPriceConsumer = await ethers.getContractFactory("ChainlinkPriceConsumer");
  const priceConsumer = await ChainlinkPriceConsumer.deploy();
  await priceConsumer.deployed();
  console.log("ChainlinkPriceConsumer:", priceConsumer.address);

  const TakepileFactory = await ethers.getContractFactory("TakepileFactory");
  const takepileFactory = await TakepileFactory.deploy();
  await takepileFactory.deployed();
  console.log("TakepileFactory:", takepileFactory.address);

  const XTakeFactory = await ethers.getContractFactory("xTakeFactory");
  const xTakeFactory = await XTakeFactory.deploy();
  await takepileFactory.deployed();
  console.log("xTakeFactory:", xTakeFactory.address);

  const TakepileDriver = await ethers.getContractFactory("TakepileDriver");
  const driver = await TakepileDriver.deploy(
    takeToken.address,
    takepileFactory.address,
    xTakeFactory.address,
    treasuryAddr,
    liquidationPass.address
  );
  await driver.deployed();
  console.log("Driver:", driver.address);


  // Transfer takepileFactory ownership to driver
  console.log('Transfering factory ownership to driver');
  await takepileFactory.transferOwnership(driver.address);

  // Transfer 75% of TAKE supply to driver for emissions
  console.log('Transfering TAKE to driver');
  await takeToken.transfer(
    driver.address,
    ethers.utils.parseUnits("75000000", 18).toString()
  );

  // await underlyingToken.transfer(
  //   ownerAddr,
  //   ethers.utils.parseUnits("100", 18).toString()
  // );

  fs.writeFileSync('deployment.json', JSON.stringify({
    treasury: treasuryAddr,
    testToken: underlyingToken.address,
    TAKE: takeToken.address,
    liquidationPass: liquidationPass.address,
    priceConsumer: priceConsumer.address,
    takepileFactor: takepileFactory.address,
    xTakeFactory: xTakeFactory.address,
    takepileDriver: driver.address,
  }, null, 2))


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
