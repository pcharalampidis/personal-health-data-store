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

  // 3. Deploy AccessControl (depends on UserRegistry and RecordManager)
  const AccessControl = await connection.ethers.getContractFactory("AccessControl");
  const accessControl = await AccessControl.deploy(userRegistryAddr, recordManagerAddr);
  const accessControlAddr = await accessControl.getAddress();
  console.log("AccessControl deployed to:", accessControlAddr);

  // 4. Deploy EmergencyAccess (depends on UserRegistry and RecordManager)
  const EmergencyAccess = await connection.ethers.getContractFactory("EmergencyAccess");
  const emergencyAccess = await EmergencyAccess.deploy(userRegistryAddr, recordManagerAddr);
  const emergencyAccessAddr = await emergencyAccess.getAddress();
  console.log("EmergencyAccess deployed to:", emergencyAccessAddr);

  // 5. Post-deployment configuration: set authorized callers on RecordManager
  console.log("\nConfiguring RecordManager authorized callers...");
  await recordManager.setAccessControlAddress(accessControlAddr);
  console.log("  - AccessControl set as authorized caller");
  await recordManager.setEmergencyAccessAddress(emergencyAccessAddr);
  console.log("  - EmergencyAccess set as authorized caller");

  // Log all addresses for .env configuration
  console.log("\n--- Contract Addresses ---");
  console.log(`USER_REGISTRY_ADDRESS=${userRegistryAddr}`);
  console.log(`RECORD_MANAGER_ADDRESS=${recordManagerAddr}`);
  console.log(`ACCESS_CONTROL_ADDRESS=${accessControlAddr}`);
  console.log(`EMERGENCY_ACCESS_ADDRESS=${emergencyAccessAddr}`);
  console.log("\nDeployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
