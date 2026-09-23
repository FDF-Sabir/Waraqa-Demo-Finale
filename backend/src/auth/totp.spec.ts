import { base32, protect, reveal, totp } from './totp';
describe('TOTP RFC 6238',()=>{
 const secret=base32(Buffer.from('12345678901234567890'));
 it.each([[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']])('vecteur à %s secondes', (time,code)=>{expect(totp(secret,Math.floor(Number(time)/30),8)).toBe(code);});
 it('chiffrement authentifié : aucune relecture avec une autre clé',()=>{const value=protect('secret-test','key-test');expect(value).not.toContain('secret-test');expect(reveal(value,'key-test')).toBe('secret-test');expect(()=>reveal(value,'another-key')).toThrow();});
});
