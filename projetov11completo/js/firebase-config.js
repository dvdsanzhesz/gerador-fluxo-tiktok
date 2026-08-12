//  firebase-config.js — conexão com o Firebase do CESS Hub.
//  A chave de API do Firebase é pública por design; a segurança vem das
//  regras do Firestore + login (mesmo e-mail/senha usados no Hub).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBoP17d6_wo9f0VATFwHGmWBLDAiMxAX8U",
  authDomain: "cess-hub.firebaseapp.com",
  projectId: "cess-hub",
  storageBucket: "cess-hub.firebasestorage.app",
  messagingSenderId: "4839862620",
  appId: "1:4839862620:web:8012b5cae2a1851c905199",
  measurementId: "G-NFYK2V487S"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
