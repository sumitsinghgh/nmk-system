const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();
const sheets = require("./config/googleAuth");
const jwt = require("jsonwebtoken");

const ADMIN_EMAIL = "admin@nmk.com";
const ADMIN_PASSWORD = "123456";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ✅ Admin Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { email: ADMIN_EMAIL },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({
    message: "Login successful",
    token,
  });
});

// ✅ Auth Middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid token." });
  }
};
app.use(express.static(path.join(__dirname, "../client")));

// ✅ Google Sheet Test Route
app.get("/test-sheet", async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A1:A1",
    });

    res.json({
      message: "Connected to Google Sheet!",
      data: response.data,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to connect",
      details: error.message,
    });
  }
});

/// ✅ Add Patient (Auto ID + Payment System)
app.post("/add-patient", async (req, res) => {
  try {
    const {
      name,
      guardian,
      mobile,
      admissionDate,
      addictionType,
      totalFees,
      paidAmount = 0,
    } = req.body;

    // Get all existing IDs
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A2:A",
    });

    const rows = response.data.values || [];

    let nextIdNumber = 1;

    if (rows.length > 0) {
      const lastId = rows[rows.length - 1][0]; // e.g. P002
      const lastNumber = parseInt(lastId.replace("P", ""));
      nextIdNumber = lastNumber + 1;
    }

    const newId = "P" + String(nextIdNumber).padStart(3, "0");

    const balance = Number(totalFees) - Number(paidAmount);
    const status = "Active";


    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:J",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            newId,
            name,
            guardian,
            mobile,
            admissionDate,
            addictionType,
            totalFees,
            paidAmount,
            balance,
            status,
          ],
        ],
      },
    });

    res.json({
      message: "Patient added successfully!",
      patientId: newId,
      balance: balance,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to add patient",
      details: error.message,
    });
  }
});


// 🔥 Temporary Browser Test (Auto ID)
app.get("/add-test", async (req, res) => {
  try {
    // Get existing IDs
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A2:A",
    });

    const rows = response.data.values || [];

    const nextNumber = rows.length + 1;
    const newId = "P" + String(nextNumber).padStart(3, "0");

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:G",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            newId,
            "Amit Kumar",
            "Ramesh Kumar",
            "9123456789",
            "2026-02-14",
            "Drugs",
            "60000",
          ],
        ],
      },
    });

    res.send(`Patient Added with ID: ${newId}`);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// ✅ Get All Patients
app.get("/patients", async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A2:J", // Header ko skip kiya (Row 1)
    });

    const rows = response.data.values || [];

    const patients = rows
    .filter(row => row[9] === "Active")   // 👈 Sirf Active
    .map((row) => ({
      id: row[0],
      name: row[1],
      guardian: row[2],
      mobile: row[3],
      admissionDate: row[4],
      addictionType: row[5],
      totalFees: row[6],
      paidAmount: row[7] || 0,
      balance: row[8] || row[6],
      status: row[9],
    }));

    res.json({
      count: patients.length,
      patients,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch patients",
      details: error.message,
    });
  }
});

// ✅ Get Patient By ID
app.get("/patients/:id", async (req, res) => {
  try {
    const patientId = req.params.id;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:G",
    });

    const rows = response.data.values;

    if (!rows || rows.length < 2) {
      return res.status(404).json({ message: "No patients found" });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const patient = dataRows
      .map((row) =>
        headers.reduce((obj, header, index) => {
          obj[header] = row[index];
          return obj;
        }, {})
      )
      .find((p) => p.ID === patientId);

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    res.json(patient);

  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch patient",
      details: error.message,
    });
  }
});

// ✅ Update Patient By ID (Auto Recalculate Balance)
app.put("/patients/:id", authenticate, async (req, res) => {

  try {
    const patientId = req.params.id;

    const {
      name,
      guardian,
      mobile,
      admissionDate,
      addictionType,
      totalFees,
    } = req.body;

    // 1️⃣ Get Full Patient Sheet Data (including Paid & Balance)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:J",
    });

    const rows = response.data.values;

    if (!rows || rows.length < 2) {
      return res.status(404).json({ message: "No patients found" });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const rowIndex = dataRows.findIndex((row) => row[0] === patientId);

    if (rowIndex === -1) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const actualRowNumber = rowIndex + 2; // header row adjust

    // 2️⃣ Get existing paid amount
    const paidAmount = Number(dataRows[rowIndex][7] || 0);
    const newTotalFees = Number(totalFees);

    // 3️⃣ Prevent invalid fee update
    if (newTotalFees < paidAmount) {
      return res.status(400).json({
        message: "Total fees cannot be less than already paid amount",
      });
    }

    const newBalance = newTotalFees - paidAmount;

    // 4️⃣ Update full row including recalculated balance
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Sheet1!A${actualRowNumber}:I${actualRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            patientId,
            name,
            guardian,
            mobile,
            admissionDate,
            addictionType,
            newTotalFees,
            paidAmount,
            newBalance,
          ],
        ],
      },
    });

    res.json({
      message: "Patient updated successfully!",
      updatedBalance: newBalance,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to update patient",
      details: error.message,
    });
  }
});

// ✅ Add Payment API
app.post("/patients/:id/pay", async (req, res) => {
  try {
    const patientId = req.params.id;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    // Get all sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:J",
    });

    const rows = response.data.values;

    if (!rows || rows.length < 2) {
      return res.status(404).json({ message: "No patients found" });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    let rowIndex = -1;
    let existingPaid = 0;

    dataRows.forEach((row, index) => {
      if (row[0] === patientId) {
        rowIndex = index + 2; // because sheet starts from row 2
        existingPaid = Number(row[7] || 0); // H column
      }
    });

    if (rowIndex === -1) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const newPaidAmount = existingPaid + Number(amount);

    // Update PaidAmount column (H column)
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Sheet1!H${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newPaidAmount]],
      },
    });

    res.json({
      message: "Payment added successfully",
      patientId,
      totalPaid: newPaidAmount,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to process payment",
      details: error.message,
    });
  }
});

// 🗑 Soft Delete Patient By ID
app.delete("/patients/:id", authenticate, async (req, res) => {

  try {
    const patientId = req.params.id;

    // 1️⃣ Get all data (including Status column)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A:J",   // 👈 Status column tak lena hai
    });

    const rows = response.data.values;

    if (!rows || rows.length < 2) {
      return res.status(404).json({ message: "No patients found" });
    }

    // 2️⃣ Find row index
    const rowIndex = rows.findIndex((row) => row[0] === patientId);

    if (rowIndex === -1) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // 3️⃣ Update Status column to "Deleted"
    // J column = Status (10th column)
    const actualRowNumber = rowIndex + 1; // Sheet index correction

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Sheet1!J${actualRowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["Deleted"]],
      },
    });

    res.json({ message: `Patient ${patientId} soft deleted successfully` });

  } catch (error) {
    res.status(500).json({
      error: "Failed to soft delete patient",
      details: error.message,
    });
  }
});


// ✅ Add Payment API (Improved Safe Version)
app.post("/add-payment", authenticate, async (req, res) => {

  try {
    const { patientId, amount, paymentMode, receivedBy } = req.body;
    const paymentAmount = Number(amount);
    const paymentDate = new Date().toISOString().split("T")[0];

    // 1️⃣ Get Patient Data FIRST
    const patientRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A2:J",
    });

    const rows = patientRes.data.values;

    if (!rows) {
      return res.status(404).json({ message: "No patients found" });
    }

    const rowIndex = rows.findIndex((row) => row[0] === patientId);

    if (rowIndex === -1) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const actualRowNumber = rowIndex + 2;

    const status = rows[rowIndex][9];  // Status column (J)

    if (status !== "Active") {
      return res.status(400).json({
      message: "Cannot add payment. Patient is deleted.",
      });
    }

    const totalFees = Number(rows[rowIndex][6] || 0);
    const existingPaid = Number(rows[rowIndex][7] || 0);

    const newPaidAmount = existingPaid + paymentAmount;

    // 2️⃣ Overpayment Protection
    if (newPaidAmount > totalFees) {
      return res.status(400).json({
        message: "Payment exceeds total fees",
      });
    }

    const newBalance = totalFees - newPaidAmount;

    // Update BOTH PaidAmount AND Balance
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `Sheet1!H${actualRowNumber}:I${actualRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[newPaidAmount, newBalance]],
      },
    });


    // 4️⃣ Generate PaymentID
    const paymentRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Payments!A2:A",
    });

    const paymentRows = paymentRes.data.values || [];
    const nextPaymentNumber = paymentRows.length + 1;
    const paymentId = "R" + String(nextPaymentNumber).padStart(3, "0");

    // 5️⃣ Add entry in Payments Sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Payments!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          [
            paymentId,
            patientId,
            paymentAmount,
            paymentDate,
            paymentMode,
            receivedBy,
          ],
        ],
      },
    });

    res.json({
      message: "Payment added successfully!",
      paymentId,
      updatedPaidAmount: newPaidAmount,
      remainingBalance: totalFees - newPaidAmount,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to add payment",
      details: error.message,
    });
  }
});

// ✅ Get All Payments
app.get("/payments", authenticate, async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Payments!A:F",
    });

    const rows = response.data.values || [];

    if (rows.length < 2) {
      return res.json({ count: 0, payments: [] });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const payments = dataRows.map(row =>
      headers.reduce((obj, header, index) => {
        obj[header] = row[index];
        return obj;
      }, {})
    );

    res.json({
      count: payments.length,
      payments
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch payments",
      details: error.message,
    });
  }
});


// ✅ Get Payment History By Patient ID
app.get("/payments/:patientId", authenticate, async (req, res) => {

  try {
    const patientId = req.params.patientId;

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Payments!A:F",
    });

    const rows = response.data.values;

    if (!rows || rows.length < 2) {
      return res.status(404).json({ message: "No payments found" });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    const payments = dataRows
      .map((row) =>
        headers.reduce((obj, header, index) => {
          obj[header] = row[index];
          return obj;
        }, {})
      )
      .filter((p) => p.PatientID === patientId);

    res.json({
      count: payments.length,
      payments,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch payments",
      details: error.message,
    });
  }
});


// ✅ Dashboard Summary (Active Patients Only)
app.get("/dashboard", authenticate, async (req, res) => {

  try {
    const patientResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Sheet1!A2:J", // Include Status column
    });

    const patientRows = patientResponse.data.values || [];

    let totalPatients = 0;
    let totalCollection = 0;
    let totalPending = 0;

    patientRows.forEach((row) => {

      const status = row[9]; // J column = Status

      if (status === "Active") {

        totalPatients++;

        const totalFees = Number(row[6] || 0);
        const paid = Number(row[7] || 0);

        totalCollection += paid;
        totalPending += (totalFees - paid);
      }
    });

    res.json({
      totalPatients,
      totalCollection,
      totalPending,
    });

  } catch (error) {
    res.status(500).json({
      error: "Failed to load dashboard",
      details: error.message,
    });
  }
});
