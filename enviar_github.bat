@echo off
echo [1/4] Removendo arquivos de runtime do Git Index (Profiles/Catalog)...
git rm -r --cached app/storage/profiles 2>nul
git rm --cached app/storage/catalog.json 2>nul

echo [2/4] Adicionando alteracoes...
git add .

echo [3/4] Criando commit...
set /p msg="Digite a mensagem do commit (Enter para padrao): "
if "%msg%"=="" set msg="feat: Dashboard BI 2.0 with Data Enrichment"
git commit -m "%msg%"

echo [4/4] Enviando para o GitHub...
git push

echo.
echo ==========================================
echo Processo finalizado!
echo Se houver erro no 'git push', verifique se o remote esta configurado.
echo ==========================================
pause
