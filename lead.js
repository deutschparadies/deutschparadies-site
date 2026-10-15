/* Course sign-up form -> email to info@deutschparadies.ro (FormSubmit) + Meta Pixel "Lead" */
(function () {
  document.querySelectorAll(".lead-form").forEach(function (f) {
  var msg = f.querySelector(".lead-msg");
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var nume = f.nume.value.trim(), tel = f.telefon.value.trim();
    if (!nume || tel.replace(/\D/g, "").length < 8) { msg.style.color = "#f0c66b"; msg.textContent = "Te rugăm să scrii numele și un număr de telefon valid."; return; }
    if (!f.acord.checked) { msg.style.color = "#f0c66b"; msg.textContent = "Te rugăm să bifezi acordul pentru a fi contactat."; return; }
    if (f._honey.value) return;
    var btn = f.querySelector("button"); btn.disabled = true; btn.style.opacity = ".6";
    msg.style.color = "#f6f1e6"; msg.textContent = "Se trimite…";
    fetch("https://formsubmit.co/ajax/info@deutschparadies.ro", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        _subject: "Înscriere nouă de pe site: " + nume + (f.curs ? " (" + f.curs.value + ")" : ""),
        _template: "table",
        Nume: nume, Telefon: tel, Nivel: f.nivel.value || "-", Curs: (f.curs && f.curs.value) || "-",
        Pagina: location.href
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && (d.success === "true" || d.success === true)) {
        msg.style.color = "#f0c66b";
        msg.textContent = "Mulțumim, " + nume + "! Profesorul Saleh te contactează în curând.";
        f.reset();
        if (window.fbq) fbq("track", "Lead");
      } else { throw new Error("fail"); }
    }).catch(function () {
      msg.style.color = "#f0c66b";
      msg.innerHTML = 'Nu s-a putut trimite. Scrie-ne pe <a style="color:#f0c66b" href="https://wa.me/40771237705">WhatsApp</a>.';
    }).finally(function () { btn.disabled = false; btn.style.opacity = ""; });
  });
  });
})();
