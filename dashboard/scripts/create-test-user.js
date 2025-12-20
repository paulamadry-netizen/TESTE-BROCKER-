// Script pour créer un utilisateur de test dans Firebase
// Exécuter avec: node scripts/create-test-user.js

const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyBCAeaaJMMw3_Egf-6-4i63IhAUy4EyzBc",
  authDomain: "teste-brocker.firebaseapp.com",
  projectId: "teste-brocker",
  storageBucket: "teste-brocker.firebasestorage.app",
  messagingSenderId: "44407447466",
  appId: "1:44407447466:web:ce5fde6a8104a1b82bd5d3",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function createTestUser() {
  const email = "test@propfirm.com";
  const password = "test123456";

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("✅ Utilisateur de test créé avec succès!");
    console.log("📧 Email:", email);
    console.log("🔑 Mot de passe:", password);
    console.log("🆔 UID:", userCredential.user.uid);
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log("ℹ️ Cet utilisateur existe déjà");
      console.log("📧 Email:", email);
      console.log("🔑 Mot de passe:", password);
      process.exit(0);
    } else {
      console.error("❌ Erreur:", error.message);
      process.exit(1);
    }
  }
}

createTestUser();
