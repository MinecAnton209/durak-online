document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('card-back-selector');
    const saveStatus = document.getElementById('save-status');
    let currentStyle = 'default';
    const availableStyles = ['default'];

    for (const styleSheet of document.styleSheets) {
        try {
            for (const rule of styleSheet.cssRules) {
                if (rule.selectorText && rule.selectorText.startsWith('.card-back.style-')) {
                    const styleName = rule.selectorText.replace('.card-back.style-', '');
                    availableStyles.push(styleName);

                    const option = document.createElement('div');
                    option.className = 'card-back-option';
                    option.dataset.style = styleName;

                    const cardDiv = document.createElement('div');
                    cardDiv.className = `card card-back style-${styleName}`;
                    
                    const span = document.createElement('span');
                    span.textContent = styleName.charAt(0).toUpperCase() + styleName.slice(1);

                    option.appendChild(cardDiv);
                    option.appendChild(span);
                    selector.appendChild(option);
                }
            }
        } catch (e) {
            console.warn("Could not read CSS rules from stylesheet:", e);
        }
    }


    function updateSelection() {
        document.querySelectorAll('.card-back-option').forEach(option => {
            option.classList.toggle('selected', option.dataset.style === currentStyle);
        });
    }

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
        saveStatus.innerText = 'Збереження...';
        try {
            const response = await fetch('/update-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_back_style: newStyle })
            });
            if (response.ok) {
                currentStyle = newStyle;
                updateSelection();
                saveStatus.innerText = 'Збережено!';
                setTimeout(() => saveStatus.innerText = '', 2000);
            } else {
                saveStatus.innerText = 'Помилка збереження.';
            }
        } catch (error) {
            saveStatus.innerText = 'Помилка мережі.';
        }
    });
});