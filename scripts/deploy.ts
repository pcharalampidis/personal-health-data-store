import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const [deployer] = await connection.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // 1. Deploy UserRegistry (no dependencies)
  const UserRegistry = await connection.ethers.getContractFactory("UserRegistry");
  const userRegistry = await UserRegistry.deploy();
  const userRegistryAddr = await userRegistry.getAddress();
  console.log("UserRegistry deployed to:", userRegistryAddr);

  // 2. Deploy RecordManager (depends on UserRegistry)
  const RecordManager = await connection.ethers.getContractFactory("RecordManager");
  const recordManager = await RecordManager.deploy(userRegistryAddr);
  const recordManagerAddr = await recordManager.getAddress();
  console.log("RecordManager deployed to:", recordManagerAddr);

  // Log all addresses for .env configuration
  console.log("\n--- Contract Addresses ---");
  console.log(`USER_REGISTRY_ADDRESS=${userRegistryAddr}`);
  console.log(`RECORD_MANAGER_ADDRESS=${recordManagerAddr}`);
  console.log("\nDeployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
