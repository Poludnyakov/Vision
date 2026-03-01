/**
 * Подключение Supabase:
 * 1. В дашборде Supabase → SQL Editor вставьте и выполните весь код из файла supabase-schema.sql (не имя файла!).
 * 2. Connect или Settings → API: скопируйте Project URL и anon public key.
 * 3. Ниже подставьте свои значения (или задайте window.SUPABASE_URL / SUPABASE_ANON_KEY до загрузки скрипта).
 *
 * ИИ-агент в чате (мотивационные письма и т.п. без персональных данных):
 * Задайте window.VISA_CHAT_API_URL = 'https://ваш-backend/chat' до загрузки export.js.
 * Опционально: window.VISA_CHAT_API_KEY для Authorization: Bearer.
 * Backend: POST JSON { messages: [{role, content}] } → { reply: "..." } или для генерации письма { reply, letter_text };
 * или POST { action: 'generate_motivation_letter', purpose, ties_to_home, trip_plan } → { letter_text }.
 */
window.SUPABASE_URL = window.SUPABASE_URL || 'https://keiygbraqdygceiyppxp.supabase.co';
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlaXlnYnJhcWR5Z2NlaXlwcHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODk2NDYsImV4cCI6MjA4Nzg2NTY0Nn0.07rdstMKEU1U8cq5zK9e0CIu_dNa-ZAgoP9xR93x2z0';

function getSupabase() {
  if (window._supabase) return window._supabase;
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    window._supabase = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return window._supabase;
  }
  return null;
}
