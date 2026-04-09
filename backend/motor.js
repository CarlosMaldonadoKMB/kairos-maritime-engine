const calculateStatus = (expiryDate) => {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "🔴 VENCIDO";
  if (diffDays <= 30) return "🟡 POR VENCER";
  return "🟢 VIGENTE";
};

module.exports = { calculateStatus };