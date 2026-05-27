import React, { useState } from "react";
import type { JsonRpcSigner } from "ethers";
import { getUserRegistryContract } from "../services/contracts.js";
import { ensureRSAKeyPair } from "../utils/rsaKeys.js";
import { friendlyErrorMessage } from "../utils/errorMessages.js";

interface Props {
  signer: JsonRpcSigner;
  account: string;
  onRegistered?: () => void;
}

export function Register({ signer, account, onRegistered }: Props) {
  const [role, setRole] = useState<"patient" | "doctor">("patient");
  const [status, setStatus] = useState("");
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState("");
  const [license, setLicense] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [institution, setInstitution] = useState("");

  const handleRegister = async () => {
    setRegistering(true);
    setStatus("");

    try {
      const userRegistry = getUserRegistryContract(signer);

      if (role === "patient") {
        setStatus("Generating encryption keys...");
        const { publicKeyHex } = await ensureRSAKeyPair(account);
        setStatus("Registering as patient...");
        const tx = await userRegistry.registerAsPatient(publicKeyHex);
        await tx.wait();
        setStatus("✅ Registered as patient successfully!");
        onRegistered?.();
      } else {
        if (!name || !license || !specialty || !institution) {
          setStatus("Please fill all doctor fields");
          setRegistering(false);
          return;
        }
        const { publicKeyHex } = await ensureRSAKeyPair(account);
        setStatus("Registering as doctor...");
        const tx = await userRegistry.registerAsDoctor(
          name, license, specialty, institution, publicKeyHex
        );
        await tx.wait();
        setStatus("✅ Registered as doctor successfully!");
        onRegistered?.();
      }
    } catch (err: any) {
      setStatus(`❌ ${friendlyErrorMessage(err)}`);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.heading}>Register</h2>
      
      <div style={styles.roleSelect}>
        <label style={styles.label}>Select Role:</label>
        <div style={styles.radioGroup}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="role"
              value="patient"
              checked={role === "patient"}
              onChange={() => setRole("patient")}
            />
            Patient
          </label>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="role"
              value="doctor"
              checked={role === "doctor"}
              onChange={() => setRole("doctor")}
            />
            Doctor
          </label>
        </div>
      </div>

      {role === "doctor" && (
        <div style={styles.doctorFields}>
          <input
            type="text"
            placeholder="Full Name (e.g., Dr. Smith)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="License Number"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="Specialty (e.g., Cardiology)"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="Institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            style={styles.input}
          />
        </div>
      )}

      <button
        onClick={handleRegister}
        disabled={registering}
        style={styles.btn}
      >
        {registering ? "Registering..." : `Register as ${role}`}
      </button>

      {status && <p style={styles.status}>{status}</p>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    padding: "var(--space-md)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-secondary)",
  },
  heading: {
    margin: "0 0 var(--space-md)",
    fontSize: "var(--font-lg)",
    fontWeight: 600,
  },
  roleSelect: {
    marginBottom: "var(--space-md)",
  },
  label: {
    display: "block",
    marginBottom: "var(--space-sm)",
    fontSize: "var(--font-base)",
    fontWeight: 500,
  },
  radioGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-md)",
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    fontSize: "var(--font-base)",
    cursor: "pointer",
    minHeight: "var(--touch-target)",
    padding: "var(--space-xs) 0",
  },
  doctorFields: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
    marginBottom: "var(--space-md)",
  },
  input: {
    padding: "var(--space-sm)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--color-border)",
    fontSize: "var(--font-base)",
    minHeight: "var(--touch-target)",
    width: "100%",
  },
  btn: {
    padding: "var(--space-sm) var(--space-lg)",
    border: "none",
    borderRadius: "var(--radius-md)",
    background: "var(--color-success)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "var(--font-base)",
    fontWeight: 600,
    minHeight: "var(--touch-target)",
    width: "100%",
  },
  status: {
    marginTop: "var(--space-sm)",
    padding: "var(--space-sm)",
    background: "var(--color-info-bg)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--font-sm)",
    wordBreak: "break-word",
  },
};
