import { registerDecorator, ValidationOptions } from 'class-validator';
export function dateIsoValide(value: unknown): boolean {
 if (value === '' || value === undefined || value === null) return true;
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date = new Date(value + 'T00:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export function IsRealDate(options?: ValidationOptions) {
 return (object: object, propertyName: string) => registerDecorator({name:'isRealDate',target:object.constructor,propertyName,options:{message:'Date inexistante ou format différent de AAAA-MM-JJ',...options},validator:{validate:dateIsoValide}});
}
