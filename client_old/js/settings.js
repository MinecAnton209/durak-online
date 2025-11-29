document.addEventListener('DOMContentLoaded', async () => {
    await initI18n();

    const selector = document.getElementById('card-back-selector');
    const saveStatus = document.getElementById('save-status');
    let currentStyle = 'default';
    const availableStyles = ['default'];

    function generateOptions() {
        for (const styleSheet of document.styleSheets) {
            try {
                for (const rule of styleSheet.cssRules) {
                    if (rule.selectorText && rule.selectorText.startsWith('.card-back.style-')) {
                        const styleName = rule.selectorText.replace('.card-back.style-', '');
                        if (availableStyles.includes(styleName)) continue;
                        availableStyles.push(styleName);

                        const option = document.createElement('div');
                        option.className = 'card-back-option';
                        option.dataset.style = styleName;

                        const cardDiv = document.createElement('div');
                        cardDiv.className = `card card-back style-${styleName}`;
                        
                        const span = document.createElement('span');
                        span.textContent = i18next.t(`style_${styleName}`);
                        span.dataset.i18n = `style_${styleName}`;

                        option.appendChild(cardDiv);
                        option.appendChild(span);
                        selector.appendChild(option);
                    }
                }
            } catch (e) {}
        }
    }

    function updateSelection() {
        document.querySelectorAll('.card-back-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.style === currentStyle);
        });
    }

    generateOptions();

    fetch('/check-session')
        .then(res => res.json())
        .then(data => {
            if (!data.isLoggedIn) {
                window.location.href = '/';
            } else {
                currentStyle = data.user.card_back_style || 'default';
                updateSelection();
            }
        });

    selector.addEventListener('click', async (e) => {
        const option = e.target.closest('.card-back-option');
        if (!option) return;
        const newStyle = option.dataset.style;
        if (newStyle === currentStyle) return;
        saveStatus.innerHTML = i18next.t('saving_status');
        try {
            const response = await fetch('/update-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_back_style: newStyle })
            });
            if (response.ok) {
                currentStyle = newStyle;
                updateSelection();
                saveStatus.innerHTML = i18next.t('saved_status_ok');
                setTimeout(() => saveStatus.innerHTML = '', 2000);
            } else {
                saveStatus.innerHTML = i18next.t('saved_status_error');
            }
        } catch (error) {
            saveStatus.innerHTML = i18next.t('error_connection');
        }
    });
});