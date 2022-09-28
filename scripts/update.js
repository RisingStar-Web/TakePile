// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
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
  console.log(`driver`, driver.address);


  const pileToken = await ethers.getContractAt(
    "TakepileToken",
    await driver.takepiles(2)
  );
  console.log(`pileTEST`, pileToken.address);



  await driver.setTakepileFeeDivisors(
    pileToken.address,
    4000, // burnFee 0.025%
    2000, // treasuryFee 0.05%
    4000, // distributionFee 0.025%
    2000  // limitFee 0.05%
  );

  await driver.setTakepileLiquidationRewardDivisor(
    pileToken.address,
    10 // 10%
  );

  await driver.setTakepileAmountParameters(
    pileToken.address,
    10, // max position 10% of total supply
    '10000000000000000' // min position 1 test token
  );


  const config = await driver.takepileConfig(pileToken.address);
  for (const c of config) {
    console.log(c.toString());
  }

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
