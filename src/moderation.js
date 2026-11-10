import { MODERATION_WORDS } from './moderation-words.js';

const allowedSuffixes = new Set(['cn', 'com', 'us', 'tv']);
const normalize = value => value.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '');
const english = MODERATION_WORDS.en.map(word => normalize(word).toLowerCase().replace(/\s+/g, ' '));
const chinese = MODERATION_WORDS.zh.map(word => normalize(word).toLowerCase());
const chineseSingle = new Set(chinese.filter(word => Array.from(word).length === 1));
const chinesePhrases = chinese.filter(word => Array.from(word).length > 1);
const letters = 'a-z\\u00c0-\\u02af\\u0370-\\u052f\\u3400-\\u9fff';
const characters = `${letters}0-9`;
const label = `[${characters}](?:[${characters}-]{0,61}[${characters}])?`;
const domain = `(?:${label}[.。．｡])+[${letters}][${characters}-]{0,62}`;
const localCharacters = `${characters}!#$%&'*+/=?^_\x60{|}~-`;
const localPart = `[${localCharacters}]+(?:\\.[${localCharacters}]+)*`;
const emailPattern = new RegExp(`(?<![${characters}._%+@-])${localPart}@${domain}(?![${characters}_-])`, 'giu');
const explicitUrlPattern = /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|www\.)[^\s<>"'`，。！？；（）【】]+/giu;
const bareDomainPattern = new RegExp(`(?<![${characters}_@-])${domain}(?::[0-9]{1,5})?(?:[/?#][^\\s<>"'\x60，。！？；（）【】]*)?(?![${characters}_-])`, 'giu');

function containsEnglishPhrase(text, phrase) {
  let index = text.indexOf(phrase);
  while (index !== -1) {
    if (!/[a-z0-9]/.test(text[index - 1] || '') && !/[a-z0-9]/.test(text[index + phrase.length] || '')) return true;
    index = text.indexOf(phrase, index + 1);
  }
  return false;
}

function overlaps(index, length, ranges) {
  return ranges.some(range => index < range.end && index + length > range.start);
}

function urlRanges(text) {
  return [...text.matchAll(explicitUrlPattern)].map(match => ({ start: match.index, end: match.index + match[0].length, value: match[0] }));
}

function emailRanges(text, urls) {
  return [...text.matchAll(emailPattern)].filter(match => {
    if (overlaps(match.index, match[0].length, urls) || match[0].length > 254) return false;
    const [local, host] = match[0].split('@');
    if (local.length > 64) return false;
    try { return new URL(`https://${host}`).hostname.split('.').at(-1).length >= 2; }
    catch { return false; }
  }).map(match => ({ start: match.index, end: match.index + match[0].length, value: match[0] }));
}

function allowedUrl(value) {
  try {
    const cleaned = value.replace(/[.,!?;:)\]}]+$/g, '').replace(/[。．｡]/g, '.');
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned) ? cleaned : cleaned.startsWith('//') ? `https:${cleaned}` : `https://${cleaned}`;
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    return ['https:', 'http:'].includes(url.protocol) && hostname.includes('.') && allowedSuffixes.has(hostname.split('.').at(-1));
  } catch { return false; }
}

export function redactEmails(value) {
  const text = value;
  const emails = emailRanges(text, urlRanges(text));
  let result = '', previous = 0;
  for (const email of emails) {
    result += text.slice(previous, email.start) + email.value.replace('@', '#');previous = email.end;
  }
  return result + text.slice(previous);
}

export function containsBlockedWord(value) {
  const text = normalize(value).toLowerCase().replace(/\s+/g, ' ').trim();
  return english.some(word => containsEnglishPhrase(text, word)) || chineseSingle.has(text) || chinesePhrases.some(word => text.includes(word));
}

export function hasDisallowedWebsite(value) {
  const text = normalize(value);
  const urls = urlRanges(text);
  const emails = emailRanges(text, urls);
  if (urls.some(url => !allowedUrl(url.value))) return true;
  const protectedRanges = [...urls, ...emails];
  for (const match of text.matchAll(bareDomainPattern)) {
    if (overlaps(match.index, match[0].length, protectedRanges)) continue;
    if (!/[a-z0-9.]/i.test(match[0])) continue;
    if (!allowedUrl(match[0])) return true;
    protectedRanges.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const match of text.matchAll(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g)) {
    if (!overlaps(match.index, match[0].length, protectedRanges) && match[0].split('.').every(part => Number(part) <= 255)) return true;
  }
  return false;
}

export function moderateMessage({ name, text }) {
  for (const [field, value] of [['name', name], ['text', text]]) {
    if (containsBlockedWord(value)) return { error: '内容包含屏蔽词，请修改后再发送。', field };
    if (hasDisallowedWebsite(value)) return { error: '网址只允许 .cn、.com、.us、.tv 域名。', field };
  }
  return { name: redactEmails(name.trim()), text: redactEmails(text.trim()) };
}
