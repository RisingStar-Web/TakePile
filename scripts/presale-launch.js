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

  const treasuryAddr = '0xD24d9546a2E27d02D97eB65a6e3706492487b711'; // defender gnosis
  const usdcAddr = '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75'; // USDC

  const ERC20 = await ethers.getContractFactory('ERC20');
  const usdc = await ERC20.attach(usdcAddr)
  console.log("USDC:", usdc.address);

  const Take = await ethers.getContractFactory('Take');
  const take = await Take.deploy();
  await take.deployed();
  console.log("TAKE", take.address);

  const decimals = await usdc.decimals();
  const TakePresale = await ethers.getContractFactory("TakePresale");
  const presaleRound1 = await TakePresale.deploy(
    ethers.utils.parseUnits('.5', decimals),
    ethers.utils.parseUnits('6000', 18),
    usdc.address,
    take.address
  );
  await presaleRound1.deployed();
  console.log("Presale Round 1:", presaleRound1.address);

  const presaleRound2 = await TakePresale.deploy(
    ethers.utils.parseUnits('.75', decimals),
    ethers.utils.parseUnits('4000', 18),
    usdc.address,
    take.address
  );
  await presaleRound2.deployed();
  console.log("Presale Round 2:", presaleRound2.address);

  console.log('Transferring Presale Round 1 ownership to Treasury');
  await presaleRound1.transferOwnership(treasuryAddr);

  console.log('Transferring Presale Round 2 ownership to Treasury');
  await presaleRound2.transferOwnership(treasuryAddr);

  console.log('Transfering 300000 TAKE to presale round 1');
  await take.transfer(
    presaleRound1.address,
    ethers.utils.parseUnits("300000", 18).toString()
  );

  console.log('Transfering 340000 TAKE to presale round 2');
  await take.transfer(
    presaleRound2.address,
    ethers.utils.parseUnits("340000", 18).toString()
  );

  // Transfer rest to Treasury
  console.log('Transfering 9360000 TAKE to treasury');
  await take.transfer(
    treasuryAddr,
    ethers.utils.parseUnits("9360000", 18).toString()
  );

  fs.writeFileSync('presale-deployment.json', JSON.stringify({
    treasury: treasuryAddr,
    USDC: usdc.address,
    TAKE: take.address,
    presaleRound1: presaleRound1.address,
    presaleRound2: presaleRound2.address,
  }, null, 2))


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
