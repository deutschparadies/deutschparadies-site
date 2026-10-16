const LEVELS = ["Începător (zero)", "A1", "A2", "B1", "B2", "C1", "Nu știu"];

export function leadForm(course) {
  const base = course ? course.split(".")[0] : "";
  const opts = LEVELS.map((o) => `<option${o === base ? " selected" : ""}>${o}</option>`).join("");
  return `<form class="lead-form" novalidate>
${course ? `<input type="hidden" name="curs" value="${course}">` : ""}
<input type="text" name="nume" placeholder="Numele tău" autocomplete="name" required>
<input type="tel" name="telefon" placeholder="Telefon / WhatsApp" autocomplete="tel" required>
<select name="nivel"><option value="">Nivelul tău (opțional)</option>${opts}</select>
<input class="hp" type="text" name="_honey" tabindex="-1" autocomplete="off">
<label class="chk"><input type="checkbox" name="acord" required> <span>Sunt de acord să fiu contactat de Deutschparadies. <a href="/confidentialitate.html">Detalii</a></span></label>
<button type="submit">Trimite — profesorul Saleh îți scrie</button>
<div class="lead-msg" role="status"></div>
</form>`;
}

export function leadBox(course, tag) {
  const title = course ? `Înscrie-te la cursul ${course} cu profesorul Saleh` : "Înscrie-te la curs cu profesorul Saleh";
  return `<section class="lead-box" id="inscriere"><${tag}>${title}</${tag}>
<p>Lasă-ne numele și numărul de telefon, iar profesorul Saleh te contactează.</p>
${leadForm(course)}</section>`;
}

// Replaces the inner content of the homepage contact card
export function contactCardInner() {
  return `<h3 data-i18n data-en="Sign up for a course with teacher Saleh">Înscrie-te la curs cu profesorul Saleh</h3>
<p data-i18n data-en="Leave your name and phone number and teacher Saleh will contact you.">Lasă-ne numele și numărul de telefon, iar profesorul Saleh te contactează.</p>
${leadForm("")}
<p class="lead-or">sau <a href="https://wa.me/40771237705">scrie-ne direct pe WhatsApp</a></p>`;
}
