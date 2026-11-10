import test from 'node:test';
import assert from 'node:assert/strict';
import { containsBlockedWord, hasDisallowedWebsite, redactEmails, moderateMessage } from '../src/moderation.js';
import { MODERATION_WORDS } from '../src/moderation-words.js';

test('both upstream language lists are bundled and common blocked terms are detected', () => {
  assert.equal(MODERATION_WORDS.en.length, 403);
  assert.equal(MODERATION_WORDS.zh.length, 319);
  for (const value of ['傻逼', '你这个傻逼', 'FUCK', 'ｆｕｃｋ', 'f\u200buck', 'bullshit']) assert.equal(containsBlockedWord(value), true, value);
});

test('English substrings and Chinese single characters do not block innocent words', () => {
  for (const value of ['class assignment', 'passage', 'classic music', '可能性、牛奶和理性讨论', '小洛今天画画了']) assert.equal(containsBlockedWord(value), false, value);
});

test('only the four permitted website suffixes are accepted, including subdomains and IDNs', () => {
  for (const value of ['example.cn', 'https://example.com', 'https://sub.example.com.cn/path', 'https://example.us', 'https://example.tv', 'HTTP://EXAMPLE.COM.', 'www.example.com', '//example.cn', 'https://例子.cn/画画', '看 https://example.com。再见', 'example.com/path/to/example.org?next=example.net']) assert.equal(hasDisallowedWebsite(value), false, value);
});

test('disallowed suffixes, misleading userinfo and IP URLs are blocked', () => {
  for (const value of ['example.org', 'https://example.net', 'www.vsqx.top', '//example.io', 'https://example.com.evil.org', 'https://safe.com@evil.org', 'https://safe.com%2eevil.net', 'https://127.0.0.1', 'http://[::1]', 'http://2130706433', '127.0.0.1', 'https://例子.中国', 'example.com 以及 example.xyz', 'ftp://example.com', 'https://example.ｏｒｇ']) assert.equal(hasDisallowedWebsite(value), true, value);
});

test('ordinary Chinese sentences, decimals, versions and mentions are not websites', () => {
  for (const value of ['今天很好。明天也开心。', '版本 1.2，数值 3.14', '@洛天依 今天好', '绘画中没有链接']) assert.equal(hasDisallowedWebsite(value), false, value);
});

test('actual email addresses are masked, including plus addressing and multiple addresses', () => {
  assert.equal(redactEmails('联系 alice+art@sub.example.org 或 BOB@example.com'), '联系 alice+art#sub.example.org 或 BOB#example.com');
  assert.equal(redactEmails('联系 me@example.org，保留中文标点！'), '联系 me#example.org，保留中文标点！');
  assert.equal(redactEmails('mailto:alice@example.org'), 'mailto:alice#example.org');
  assert.equal(redactEmails('https://alice@example.com/path'), 'https://alice@example.com/path');
  for (const value of ['@洛天依', 'hello @alice', 'a @ example.com', 'a..b@example.com', 'foo@bar', 'a@b.c']) assert.equal(redactEmails(value), value, value);
});

test('email domains do not count as website links, but other links in the message still do', () => {
  assert.equal(hasDisallowedWebsite('联系 alice@example.org'), false);
  assert.equal(hasDisallowedWebsite('alice@example.org 同时看看 example.net'), true);
  assert.deepEqual(moderateMessage({ name: '云朵', text: '联系 alice@example.org' }), { name: '云朵', text: '联系 alice#example.org' });
});

test('moderation covers both nickname and body with a field-specific error', () => {
  assert.equal(moderateMessage({ name: 'fuck', text: '正常内容' }).field, 'name');
  assert.equal(moderateMessage({ name: '云朵', text: 'https://example.net' }).field, 'text');
  assert.deepEqual(moderateMessage({ name: 'a@example.org', text: '好心情' }), { name: 'a#example.org', text: '好心情' });
});
