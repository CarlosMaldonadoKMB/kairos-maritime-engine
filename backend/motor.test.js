const { calculateStatus } = require('./motor');

describe('Pruebas del Motor de Estados Kairos', () => {

  test('Debe retornar 🔴 VENCIDO si la fecha ya pasó', () => {
    expect(calculateStatus('2020-01-01')).toBe('🔴 VENCIDO');
  });

  test('Debe retornar 🟡 POR VENCER si faltan 15 días', () => {
    const porVencer = new Date();
    porVencer.setDate(porVencer.getDate() + 15);
    expect(calculateStatus(porVencer)).toBe('🟡 POR VENCER');
  });

  test('Debe retornar 🟢 VIGENTE si faltan 60 días', () => {
    const vigente = new Date();
    vigente.setDate(vigente.getDate() + 60);
    expect(calculateStatus(vigente)).toBe('🟢 VIGENTE');
  });

});