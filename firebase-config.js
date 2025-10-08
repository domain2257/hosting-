
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, get, child, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDXxgwIPN1LtRrYAfIfGjBW0NJdXsso7BY",
  authDomain: "tradex-1126f.firebaseapp.com",
  databaseURL: "https://tradex-1126f-default-rtdb.firebaseio.com",
  projectId: "tradex-1126f",
  storageBucket: "tradex-1126f.firebasestorage.app",
  messagingSenderId: "973958868405",
  appId: "1:973958868405:web:ea7f63dcd8d4b262817dfc",
  measurementId: "G-J538LHEWL6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export { auth, database, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, ref, set, get, child, remove };
