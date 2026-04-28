import React, { useState } from "react";
import type { JsonRpcSigner } from "ethers";
import { getUserRegistryContract } from "../services/contracts.js";

interface Props {
  signer: JsonRpcSigner;
  account: string;
}

export function Register({ signer, account }: Props) {
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
        // Generate a random public key for demo (in real app, this would be user's encryption public key)
        const mockPublicKey = "0x" + "ab".repeat(32);
        setStatus("Registering as patient...");
        const tx = await userRegistry.registerAsPatient(mockPublicKey);
        await tx.wait();
        setStatus("✅ Registered as patient successfully!");
      } else {
        // Validate doctor fields
        if (!name || !license || !specialty || !institution) {
          setStatus("Please fill all doctor fields");
          setRegistering(false);
          return;
        }
        const mockPublicKey = "0x" + "cd".repeat(32);
        setStatus("Registering as doctor...");
        const tx = await userRegistry.registerAsDoctor(
          name, license, specialty, institution, mockPublicKey
        );
        await tx.wait();
        setStatus("✅ Registered as doctor successfully!");
      }
    } catch (err: any) {
      setStatus(`❌ Error: ${err.message || err.reason || "Unknown error"}`);
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
    padding: "1.25rem",
    borderRadius: 10,
    border: "1px solid #e0e0e0",
    background: "#fafafa",
  },
  heading: {
    margin: "0 0 1rem",
    fontSize: "1.1rem",
    fontWeight: 600,
  },
  roleSelect: {
    marginBottom: "1rem",
  },
  label: {
    display: "block",
    marginBottom: "0.5rem",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
  radioGroup: {
    display: "flex",
    gap: "1.5rem",
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  doctorFields: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  input: {
    padding: "0.5rem",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: "0.9rem",
  },
  btn: {
    padding: "0.6rem 1.5rem",
    border: "none",
    borderRadius: 6,
    background: "#4caf50",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  status: {
    marginTop: "0.75rem",
    padding: "0.5rem",
    background: "#f0f4ff",
    borderRadius: 6,
    fontSize: "0.85rem",
  },
};
