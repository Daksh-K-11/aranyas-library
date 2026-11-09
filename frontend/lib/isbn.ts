export function cleanIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, "").toUpperCase()
}

export function isValidIsbn(raw: string): boolean {
  const s = cleanIsbn(raw)
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0
    for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i)
    return sum % 11 === 0
  }
  if (/^97[89]\d{10}$/.test(s)) {
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3)
    return (10 - (sum % 10)) % 10 === Number(s[12])
  }
  return false
}

export function isbnProblem(raw: string): string | null {
  const s = cleanIsbn(raw)
  if (!s) return "Enter an ISBN"
  if (s.length !== 10 && s.length !== 13) return "An ISBN has 10 or 13 digits"
  if (s.length === 13 && !/^97[89]/.test(s)) return "That barcode is not a book ISBN (it should start with 978 or 979)"
  if (!isValidIsbn(s)) return "The check digit does not match. Please double-check the number."
  return null
}
