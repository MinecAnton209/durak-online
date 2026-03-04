const locales = {
    uk: {
        welcome: "Привіт, {name}! 👋\n\nЦе легендарна гра \"Дурень Онлайн\".\nТисни кнопку нижче, щоб почати!",
        play_btn: "🃏 Грати в Дурака",
        add_group_btn: "👥 Додати в групу",
        help: "Просто напиши @{botname} в будь-якому чаті, щоб запросити друзів!\n\nКоманди:\n/profile - Мій профіль\n/createroom - Створити кімнату\n/donate - Підтримати проект",

        btn_friends: "👥 Друзі",
        btn_leaderboard: "🏆 Топ гравців",
        btn_achievements: "🏅 Досягнення",
        btn_daily_bonus: "💰 Щоденний бонус",
        btn_settings: "⚙️ Налаштування",
        btn_donate: "✨ Пожертвувати (Stars)",

        buttons: {
            cancel: "🔙 Скасувати",
            back_to_menu: "⬅️ Головне меню",
            back_to_settings: "⬅️ До налаштувань"
        },

        profile: {
            caption: "👤 **Твій профіль**\n\n🆔 ID: `{id}`\n👤 Нік: **{username}**\n🛡 Статус акаунта: {account_status}\n\n🏆 Перемог: **{wins}**\n📉 Поразок: **{losses}**\n⭐ Рейтинг: **{rating}**\n💰 Монети: **{coins}**",
            status_full: "✅ Повноцінний (Логін/Пароль)",
            status_tg_only: "⚠️ Тільки Telegram (Встанови пароль!)",

            btn_open: "👤 Мій профіль",
            btn_edit_nick: "✏️ Змінити нік",
            btn_set_pass: "🔑 Встановити пароль",
            btn_change_pass: "🔑 Змінити пароль",
            btn_refresh: "🔄 Оновити",

            enter_new_nick: "✍️ Напиши новий нікнейм (3-15 символів, англійські літери/цифри):",
            enter_old_pass: "🔒 Введи **старий** пароль для підтвердження:",
            enter_new_pass: "✍️ Тепер напиши **новий** пароль (від 4 символів):",

            nick_updated: "✅ Нікнейм успішно змінено на: **{username}**",
            pass_set_success: "✅ Пароль успішно змінено! Повідомлення видалено задля безпеки.",

            error_nick_taken: "❌ Цей нікнейм вже зайнятий. Спробуй інший.",
            error_format: "❌ Помилка формату.",
            error_wrong_pass: "❌ Невірний старий пароль. Спробуй ще раз.",
            error_db: "❌ Помилка бази даних.",
            cancel: "Скасовано."
        },
        friends: {
            caption: "👥 **Список друзів**\n\nВсього друзів: **{count}**\nЗаявок у друзі: **{requests}**",
            list_empty: "У вас поки немає друзів. Знайдіть їх у грі або запросіть посиланням!",
            btn_my_friends: "📜 Мої друзі",
            btn_requests: "📩 Заявки ({count})",
            btn_add: "➕ Додати друга",
            incoming_request: "📩 Заявка від **{username}**",
            btn_accept: "✅ Прийняти",
            btn_decline: "❌ Відхилити",
            accepted: "✅ Тепер ви друзі з **{username}**!",
            declined: "❌ Заявку відхилено.",
            invite_link: "🔗 Запросити друга: {link}"
        },
        leaderboard: {
            caption: "🏆 **Топ {limit} найкращих гравців**",
            empty: "Поки що ніхто не грав.",
            format: "{rank}. {icon} **{username}** — {score} 🏆",
            btn_rating: "⭐ За рейтингом",
            btn_wins: "🏅 За перемогами"
        },
        donate: {
            ask_amount: "✨ **Підтримка розробника**\n\nВведіть кількість Telegram Stars (⭐), яку бажаєте пожертвувати (мінімум 1):",
            error_amount: "❌ Будь ласка, введіть ціле число більше 0.",
            error_too_big: "❌ Занадто велика сума. Максимум 2500 ⭐.",
            title: "Пожертва на розвиток",
            description: "Дякую за підтримку проекту Durak Online! ❤️",
            label: "пожертва",
            success: "🙏 **Дякуємо!**\nВи пожертвували **{amount}** ⭐. Ваша підтримка неймовірно важлива!"
        },
        inline: {
            title: "🎮 Почати гру",
            desc: "Надіслати кнопку для гри в цей чат",
            message: "Хто хоче в Дурака? Залітайте! 🃏",
            button: "🚀 Грати",

            create_lobby_title: "🎮 Створити приватне лобі",
            create_lobby_desc: "Створити гру і надіслати запрошення",
            lobby_invite_message: "👋 Хто хоче в Дурака? Створено приватне лобі!\nТисни кнопку нижче 👇",
            lobby_join_button: "🚀 Увійти в лобі",
            create_podkidnoy_btn: "Підкидний",
            create_perevodnoy_btn: "Перевідний"
        },
        bot: {
            lobby_created: "✅ Приватне лобі #{id} створено!\n\nКод для входу: `{code}`\n\nЗапросіть друзів за цим посиланням:",
            lobby_expired: "Ваше лобі #{id} було видалено через неактивність.",
            join_link_btn: "🔗 Приєднатися до гри",
            lobby_already_exists: "⚠️ Лобі вже створено!",
            create_error: "❌ Помилка при створенні кімнати."
        },
        errors: {
            no_account: "❌ Акаунт не знайдено. Зайдіть у гру через кнопку 'Грати', щоб створити профіль.",
            user_not_found: "❌ Користувача не знайдено.",
            error_private_only: "🔒 Ця дія доступна тільки в особистих повідомленнях з ботом."
        },
        status: {
            title: "📊 *Статус Сервера*",
            status: "🟢 **Статус:** {status}",
            uptime: "⏱ **Аптайм:** {uptime}",
            online: "👥 **Онлайн:** {online}",
            games: "🎮 **Активні ігри:** {games}",
            players: "🃏 **Гравців у грі:** {players}",
            bots: "🤖 **Ігри з ботами:** {bots}",
            today_title: "📅 **Сьогодні:**",
            registrations: "🆕 Реєстрацій: {count}",
            games_played: "🎲 Зіграно ігор: {count}",
            system_title: "💻 **Система:**",
            memory: "🧠 Пам'ять: {memory}",
            ping: "⚡ Пінг БД: {ping}мс",
            version: "v{version}",
            error_fetch: "Помилка отримання статистики.",
            not_available: "Статистика недоступна."
        },
        inbox: {
            title: "📥 Вхідні повідомлення",
            empty: "У вас немає повідомлень.",
            friend_request_title: "🤝 Запит у друзі",
            friend_request_content: "Користувач **{fromUsername}** хоче додати вас у друзі.",
            login_alert_title: "🛡 Новий вхід в акаунт",
            login_alert_content: "Виконано вхід з IP: **{ip}** ({location}).\nПристрій: {userAgent}",
            btn_accept: "Прийняти",
            btn_decline: "Відхилити",
            btn_it_was_me: "Це я",
            btn_details: "Детальніше",
            prev_page: "⬅️ Сюди",
            next_page: "Туди ➡️",
            page_info: "Сторінка {current} з {total}",
            admin_message_title: "📢 Повідомлення від Адміністрації",
            admin_message_content: "{text}",
            game_invite_title: "🎮 Запрошення в гру",
            game_invite_content: "Гравець **{fromUsername}** запрошує вас приєднатися до гри.",
            admin_coins_added_title: "💰 Монети отримано",
            admin_coins_added_content: "Адміністратор додав вам **{amount}** монет. Привід: {reason}",
            admin_mute_title: "🔇 Обмеження чату",
            admin_mute_content: "Вам видано обмеження чату з причини: **{reason}**{until}",
            admin_unmute_title: "🔊 Чат розблоковано",
            admin_unmute_content: "Адміністратор зняв з вас обмеження чату.",
            admin_ban_title: "🚫 Акаунт заблоковано",
            admin_ban_content: "Ваш акаунт заблоковано з причини: **{reason}**{until}",
            admin_unban_title: "✅ Акаунт розблоковано",
            admin_unban_content: "Ваш акаунт було розблоковано адміністратором.",
            admin_session_terminated_title: "🚪 Сесію завершено",
            admin_session_terminated_content: "Вашу сесію було примусово завершено адміністратором."
        },
        achievements: {
            title: "🏅 **Твої досягнення**\n\nВідкрито: **{count}** з **{total}**",
            empty: "Ви ще не відкрили жодного досягнення. Грайте більше!",
            list_item: "{icon} **{name}**\n_{desc}_",
            rarity_common: "⚪️", rarity_uncommon: "🟢", rarity_rare: "🔵", rarity_epic: "🟣", rarity_legendary: "🟠"
        },
        daily_bonus: {
            available: "💰 **Щоденний бонус доступний!**\n\nВи можете отримати **{amount}** монет.",
            claimed: "✅ Ви вже отримали бонус сьогодні. Приходьте завтра!",
            success: "🎁 **Вітаємо!**\nВи отримали **{amount}** монет!",
            btn_claim: "🎁 Отримати бонус"
        },
        settings: {
            title: "⚙️ **Налаштування**",
            btn_card_back: "🃏 Стиль карт",
            btn_quick_game: "⚡️ Швидка гра",
            btn_sessions: "🛡 Сесії",
            btn_security: "🔑 Безпека",

            card_back_title: "🃏 **Оберіть стиль карт**",
            card_back_current: "Поточний: **{style}**",

            quick_game_title: "⚡️ **Налаштування швидкої гри**",
            quick_game_desc: "Ці налаштування будуть використовуватися при натисканні 'Швидка гра' у веб-додатку.",
            deck_size: "🎴 Карт у колоді: **{value}**",
            max_players: "👥 Гравців: **{value}**",
            game_mode: "🎮 Режим: **{value}**",
            betting: "💰 Ставки: **{value}**",
            bet_amount: "💵 Сума ставки: **{value}**",

            sessions_title: "🛡 **Активні сесії**",
            sessions_desc: "Список пристроїв, на яких ви авторизовані.",
            sessions_current: "📌 Ваша поточна сесія (ТГ)",
            sessions_item: "📱 {os}, {browser}\n📍 {ip} ({location})\n🕒 {active}",
            btn_terminate_all: "🚫 Завершити всі інші сесії",
            terminated_all: "✅ Всі інші сесії завершено."
        }
    },

    ru: {
        welcome: "Привет, {name}! 👋\n\nЭто легендарная игра \"Дурак Онлайн\".\nЖми кнопку ниже, чтобы начать!",
        play_btn: "🃏 Играть в Дурака",
        add_group_btn: "👥 Добавить в группу",
        help: "Просто напиши @{botname} в любом чате, чтобы пригласить друзей!\n\nКоманды:\n/profile - Мой профиль\n/createroom - Создать комнату\n/donate - Поддержать проект",

        btn_friends: "👥 Друзья",
        btn_leaderboard: "🏆 Топ игроков",
        btn_achievements: "🏅 Достижения",
        btn_daily_bonus: "💰 Ежедневный бонус",
        btn_settings: "⚙️ Настройки",
        btn_donate: "✨ Пожертвовать (Stars)",

        buttons: {
            cancel: "🔙 Отмена",
            back_to_menu: "⬅️ Главное меню",
            back_to_settings: "⬅️ К настройкам"
        },

        profile: {
            caption: "👤 **Твой профиль**\n\n🆔 ID: `{id}`\n👤 Ник: **{username}**\n🛡 Статус аккаунта: {account_status}\n\n🏆 Побед: **{wins}**\n📉 Поражений: **{losses}**\n⭐ Рейтинг: **{rating}**\n💰 Монеты: **{coins}**",
            status_full: "✅ Полноценный (Логин/Пароль)",
            status_tg_only: "⚠️ Только Telegram (Установи пароль!)",

            btn_open: "👤 Мой профиль",
            btn_edit_nick: "✏️ Изменить ник",
            btn_set_pass: "🔑 Установить пароль",
            btn_change_pass: "🔑 Изменить пароль",
            btn_refresh: "🔄 Обновить",

            enter_new_nick: "✍️ Напиши новый никнейм (3-15 символов, английские буквы/цифры):",
            enter_old_pass: "🔒 Введи **старый** пароль для подтверждения:",
            enter_new_pass: "✍️ Теперь напиши **новый** пароль (от 4 символов):",

            nick_updated: "✅ Никнейм успешно изменен на: **{username}**",
            pass_set_success: "✅ Пароль успешно изменен! Сообщение удалено в целях безопасности.",

            error_nick_taken: "❌ Этот никнейм уже занят. Попробуй другой.",
            error_format: "❌ Ошибка формата.",
            error_wrong_pass: "❌ Неверный старый пароль. Попробуй еще раз.",
            error_db: "❌ Ошибка базы данных.",
            cancel: "Отменено."
        },
        friends: {
            caption: "👥 **Список друзей**\n\nВсего друзей: **{count}**\nЗаявок в друзья: **{requests}**",
            list_empty: "У вас пока нет друзей. Найдите их в игре или пригласите ссылкой!",
            btn_my_friends: "📜 Мои друзья",
            btn_requests: "📩 Заявки ({count})",
            btn_add: "➕ Добавить друга",
            incoming_request: "📩 Заявка от **{username}**",
            btn_accept: "✅ Принять",
            btn_decline: "❌ Отклонить",
            accepted: "✅ Теперь вы друзья с **{username}**!",
            declined: "❌ Заявка отклонена.",
            invite_link: "🔗 Пригласить друга: {link}"
        },
        leaderboard: {
            caption: "🏆 **Топ {limit} лучших игроков**",
            empty: "Пока что никто не играл.",
            format: "{rank}. {icon} **{username}** — {score} 🏆",
            btn_rating: "⭐ По рейтингу",
            btn_wins: "🏅 По победам"
        },
        donate: {
            ask_amount: "✨ **Поддержка разработчика**\n\nВведите количество Telegram Stars (⭐), которое хотите пожертвовать (минимум 1):",
            error_amount: "❌ Пожалуйста, введите целое число больше 0.",
            error_too_big: "❌ Слишком большая сумма. Максимум 2500 ⭐.",
            title: "Пожертвование на развитие",
            description: "Спасибо за поддержку проекта Durak Online! ❤️",
            label: "пожертвование",
            success: "🙏 **Спасибо!**\nВы пожертвовали **{amount}** ⭐. Ваша поддержка невероятно важна!"
        },
        inline: {
            title: "🎮 Начать игру",
            desc: "Отправить кнопку для игры в этот чат",
            message: "Кто хочет в Дурака? Залетайте! 🃏",
            button: "🚀 Играть",

            create_lobby_title: "🎮 Создать приватное лобби",
            create_lobby_desc: "Создать игру и отправить приглашение",
            lobby_invite_message: "👋 Кто хочет в Дурака? Создано приватное лобби!\nЖми кнопку ниже 👇",
            lobby_join_button: "🚀 Войти в лобби",
            create_podkidnoy_btn: "Подкидной",
            create_perevodnoy_btn: "Переводной"
        },
        bot: {
            lobby_created: "✅ Приватное лобби #{id} создано!\n\nКод для входа: `{code}`\n\nПригласите друзей по этой ссылке:",
            lobby_expired: "Ваше лобби #{id} было удалено из-за неактивности.",
            join_link_btn: "🔗 Присоединиться к игре",
            lobby_already_exists: "⚠️ Лобби уже создано!",
            create_error: "❌ Ошибка при создании комнаты."
        },
        errors: {
            no_account: "❌ Аккаунт не найден. Зайдите в игру через кнопку 'Играть', чтобы создать профиль.",
            user_not_found: "❌ Пользователь не найден.",
            error_private_only: "🔒 Это действие доступно только в личных сообщениях с ботом."
        },
        status: {
            title: "📊 *Статус Сервера*",
            status: "🟢 **Статус:** {status}",
            uptime: "⏱ **Аптайм:** {uptime}",
            online: "👥 **Онлайн:** {online}",
            games: "🎮 **Активные игры:** {games}",
            players: "🃏 **Игроков в игре:** {players}",
            bots: "🤖 **Игры с ботами:** {bots}",
            today_title: "📅 **Сегодня:**",
            registrations: "🆕 Регистраций: {count}",
            games_played: "🎲 Сыграно игр: {count}",
            system_title: "💻 **Система:**",
            memory: "🧠 Память: {memory}",
            ping: "⚡ Пинг БД: {ping}мс",
            version: "v{version}",
            error_fetch: "Ошибка получения статистики.",
            not_available: "Статистика недоступна."
        },
        inbox: {
            title: "📥 Входящие сообщения",
            empty: "У вас нет сообщений.",
            friend_request_title: "🤝 Запрос в друзья",
            friend_request_content: "Пользователь **{fromUsername}** хочет добавить вас в друзья.",
            login_alert_title: "🛡 Новый вход в аккаунт",
            login_alert_content: "Выполнен вход с IP: **{ip}** ({location}).\nУстройство: {userAgent}",
            btn_accept: "Принять",
            btn_decline: "Отклонить",
            btn_it_was_me: "Это я",
            btn_details: "Подробнее",
            prev_page: "⬅️ Сюда",
            next_page: "Туда ➡️",
            page_info: "Страница {current} из {total}",
            admin_message_title: "📢 Сообщение от Администрации",
            admin_message_content: "{text}",
            game_invite_title: "🎮 Приглашение в игру",
            game_invite_content: "Игрок **{fromUsername}** приглашает вас присоединиться к игре.",
            admin_coins_added_title: "💰 Монеты получены",
            admin_coins_added_content: "Администратор добавил вам **{amount}** монет. Повод: {reason}",
            admin_mute_title: "🔇 Ограничение чата",
            admin_mute_content: "Вам выдано ограничение чата по причине: **{reason}**{until}",
            admin_unmute_title: "🔊 Чат разблокирован",
            admin_unmute_content: "Администратор снял с вас ограничение чата.",
            admin_ban_title: "🚫 Аккаунт заблокирован",
            admin_ban_content: "Ваш аккаунт заблокирован по причине: **{reason}**{until}",
            admin_unban_title: "✅ Аккаунт разблокирован",
            admin_unban_content: "Ваш аккаунт был разблокирован администратором.",
            admin_session_terminated_title: "🚪 Сессия завершена",
            admin_session_terminated_content: "Ваша сессия была принудительно завершена администратором."
        },
        achievements: {
            title: "🏅 **Твои достижения**\n\nОткрыто: **{count}** из **{total}**",
            empty: "Вы еще не открыли ни одного достижения. Играйте больше!",
            list_item: "{icon} **{name}**\n_{desc}_",
            rarity_common: "⚪️", rarity_uncommon: "🟢", rarity_rare: "🔵", rarity_epic: "🟣", rarity_legendary: "🟠"
        },
        daily_bonus: {
            available: "💰 **Ежедневный бонус доступен!**\n\nВы можете получить **{amount}** монет.",
            claimed: "✅ Вы уже получили бонус сегодня. Приходите завтра!",
            success: "🎁 **Поздравляем!**\nВы получили **{amount}** монет!",
            btn_claim: "🎁 Получить бонус"
        },
        settings: {
            title: "⚙️ **Настройки**",
            btn_card_back: "🃏 Стиль карт",
            btn_quick_game: "⚡️ Быстрая игра",
            btn_sessions: "🛡 Сессии",
            btn_security: "🔑 Безопасность",

            card_back_title: "🃏 **Выберите стиль карт**",
            card_back_current: "Текущий: **{style}**",

            quick_game_title: "⚡️ **Настройки быстрой игры**",
            quick_game_desc: "Эти настройки будут использоваться при нажатии 'Быстрая игра' в веб-приложении.",
            deck_size: "🎴 Карт в колоде: **{value}**",
            max_players: "👥 Игроков: **{value}**",
            game_mode: "🎮 Режим: **{value}**",
            betting: "💰 Ставки: **{value}**",
            bet_amount: "💵 Сумма ставки: **{value}**",

            sessions_title: "🛡 **Активные сессии**",
            sessions_desc: "Список устройств, на которых вы авторизованы.",
            sessions_current: "📌 Ваша текущая сессия (ТГ)",
            sessions_item: "📱 {os}, {browser}\n📍 {ip} ({location})\n🕒 {active}",
            btn_terminate_all: "🚫 Завершить все остальные сессии",
            terminated_all: "✅ Все остальные сессии завершены."
        }
    },

    en: {
        welcome: "Hello, {name}! 👋\n\nThis is the legendary \"Durak Online\".\nPress the button below to start!",
        play_btn: "🃏 Play Durak",
        add_group_btn: "👥 Add to Group",
        help: "Just type @{botname} in any chat to invite friends!\n\nCommands:\n/profile - My Profile\n/createroom - Create Room\n/donate - Support Project",

        btn_friends: "👥 Friends",
        btn_leaderboard: "🏆 Leaderboard",
        btn_achievements: "🏅 Achievements",
        btn_daily_bonus: "💰 Daily Bonus",
        btn_settings: "⚙️ Settings",
        btn_donate: "✨ Donate (Stars)",

        buttons: {
            cancel: "🔙 Cancel",
            back_to_menu: "⬅️ Main Menu",
            back_to_settings: "⬅️ To Settings"
        },

        profile: {
            caption: "👤 **Your Profile**\n\n🆔 ID: `{id}`\n👤 Nick: **{username}**\n🛡 Account Status: {account_status}\n\n🏆 Wins: **{wins}**\n📉 Losses: **{losses}**\n⭐ Rating: **{rating}**\n💰 Coins: **{coins}**",
            status_full: "✅ Full Access (Login/Password)",
            status_tg_only: "⚠️ Telegram Only (Set password!)",

            btn_open: "👤 My Profile",
            btn_edit_nick: "✏️ Change Nickname",
            btn_set_pass: "🔑 Set Password",
            btn_change_pass: "🔑 Change Password",
            btn_refresh: "🔄 Refresh",

            enter_new_nick: "✍️ Enter new nickname (3-15 chars, letters/numbers):",
            enter_old_pass: "🔒 Enter **old** password to confirm:",
            enter_new_pass: "✍️ Now enter **new** password (min 4 chars):",

            nick_updated: "✅ Nickname changed to: **{username}**",
            pass_set_success: "✅ Password changed successfully! Message deleted for security.",

            error_nick_taken: "❌ This nickname is already taken.",
            error_format: "❌ Format error.",
            error_wrong_pass: "❌ Wrong old password. Try again.",
            error_db: "❌ Database error.",
            cancel: "Cancelled."
        },
        friends: {
            caption: "👥 **Friends List**\n\nTotal friends: **{count}**\nFriend requests: **{requests}**",
            list_empty: "You have no friends yet. Find them in game or invite via link!",
            btn_my_friends: "📜 My Friends",
            btn_requests: "📩 Requests ({count})",
            btn_add: "➕ Add Friend",
            incoming_request: "📩 Request from **{username}**",
            btn_accept: "✅ Accept",
            btn_decline: "❌ Decline",
            accepted: "✅ You are now friends with **{username}**!",
            declined: "❌ Request declined.",
            invite_link: "🔗 Invite friend: {link}"
        },
        leaderboard: {
            caption: "🏆 **Top {limit} Players**",
            empty: "No players yet.",
            format: "{rank}. {icon} **{username}** — {score} 🏆",
            btn_rating: "⭐ By Rating",
            btn_wins: "🏅 By Wins"
        },
        donate: {
            ask_amount: "✨ **Support the developer**\n\nEnter the amount of Telegram Stars (⭐) you want to donate (min 1):",
            error_amount: "❌ Please enter a whole number greater than 0.",
            error_too_big: "❌ Amount too big. Max 2500 ⭐.",
            title: "Donation for development",
            description: "Thanks for supporting Durak Online! ❤️",
            label: "donation",
            success: "🙏 **Thank you!**\nYou donated **{amount}** ⭐. Your support is incredibly important!"
        },
        inline: {
            title: "🎮 Start Game",
            desc: "Send game button to this chat",
            message: "Who wants to play Durak? Join now! 🃏",
            button: "🚀 Play",

            create_lobby_title: "🎮 Create Private Lobby",
            create_lobby_desc: "Create game and send invite",
            lobby_invite_message: "👋 Who wants to play Durak? Private lobby created!\nPress the button below 👇",
            lobby_join_button: "🚀 Join Lobby",
            create_podkidnoy_btn: "Throw-in",
            create_perevodnoy_btn: "Transfer"
        },
        bot: {
            lobby_created: "✅ Private lobby #{id} created!\n\nEntry code: `{code}`\n\nInvite friends via this link:",
            lobby_expired: "Your lobby #{id} was deleted due to inactivity.",
            join_link_btn: "🔗 Join Game",
            lobby_already_exists: "⚠️ Lobby already exists!",
            create_error: "❌ Error creating room."
        },
        errors: {
            no_account: "❌ Account not found. Enter the game via 'Play' button to create a profile.",
            user_not_found: "❌ User not found.",
            error_private_only: "🔒 This action is only available in private messages with the bot."
        },
        status: {
            title: "📊 *Server Status*",
            status: "🟢 **Status:** {status}",
            uptime: "⏱ **Uptime:** {uptime}",
            online: "👥 **Online:** {online}",
            games: "🎮 **Games Active:** {games}",
            players: "🃏 **Players in Game:** {players}",
            bots: "🤖 **Bot Games:** {bots}",
            today_title: "📅 **Today:**",
            registrations: "🆕 Registrations: {count}",
            games_played: "🎲 Games Played: {count}",
            system_title: "💻 **System:**",
            memory: "🧠 Memory: {memory}",
            ping: "⚡ DB Ping: {ping}ms",
            version: "v{version}",
            error_fetch: "Error fetching stats.",
            not_available: "Stats not available."
        },
        inbox: {
            title: "📥 Inbox Messages",
            empty: "You have no messages.",
            friend_request_title: "🤝 Friend Request",
            friend_request_content: "User **{fromUsername}** wants to add you as a friend.",
            login_alert_title: "🛡 New Account Login",
            login_alert_content: "Login from IP: **{ip}** ({location}).\nDevice: {userAgent}",
            btn_accept: "Accept",
            btn_decline: "Decline",
            btn_it_was_me: "It was me",
            btn_details: "Details",
            prev_page: "⬅️ Prev",
            next_page: "Next ➡️",
            page_info: "Page {current} of {total}",
            admin_message_title: "📢 Message from Administration",
            admin_message_content: "{text}",
            game_invite_title: "🎮 Game Invitation",
            game_invite_content: "User **{fromUsername}** invites you to join a game.",
            admin_coins_added_title: "💰 Coins Received",
            admin_coins_added_content: "Admin added **{amount}** coins to your balance. Reason: {reason}",
            admin_mute_title: "🔇 Chat Restricted",
            admin_mute_content: "You have been muted for: **{reason}**{until}",
            admin_unmute_title: "🔊 Chat Restored",
            admin_unmute_content: "Admin has removed your chat restriction.",
            admin_ban_title: "🚫 Account Banned",
            admin_ban_content: "Your account has been banned for: **{reason}**{until}",
            admin_unban_title: "✅ Account Restored",
            admin_unban_content: "Your account has been restored by an administrator.",
            admin_session_terminated_title: "🚪 Session Terminated",
            admin_session_terminated_content: "Your session was forcibly terminated by an administrator."
        },
        achievements: {
            title: "🏅 **Your Achievements**\n\nUnlocked: **{count}** of **{total}**",
            empty: "You haven't unlocked any achievements yet. Play more!",
            list_item: "{icon} **{name}**\n_{desc}_",
            rarity_common: "⚪️", rarity_uncommon: "🟢", rarity_rare: "🔵", rarity_epic: "🟣", rarity_legendary: "🟠"
        },
        daily_bonus: {
            available: "💰 **Daily bonus available!**\n\nYou can claim **{amount}** coins.",
            claimed: "✅ You've already claimed your bonus today. Come back tomorrow!",
            success: "🎁 **Congratulations!**\nYou received **{amount}** coins!",
            btn_claim: "🎁 Claim Bonus"
        },
        settings: {
            title: "⚙️ **Settings**",
            btn_card_back: "🃏 Card Backs",
            btn_quick_game: "⚡️ Quick Game",
            btn_sessions: "🛡 Sessions",
            btn_security: "🔑 Security",

            card_back_title: "🃏 **Choose Card Back**",
            card_back_current: "Current: **{style}**",

            quick_game_title: "⚡️ **Quick Game Settings**",
            quick_game_desc: "These settings will be used when you click 'Quick Play' in the web app.",
            deck_size: "🎴 Deck size: **{value}**",
            max_players: "👥 Players: **{value}**",
            game_mode: "🎮 Mode: **{value}**",
            betting: "💰 Betting: **{value}**",
            bet_amount: "💵 Bet amount: **{value}**",

            sessions_title: "🛡 **Active Sessions**",
            sessions_desc: "List of devices where you are logged in.",
            sessions_current: "📌 Your current session (TG)",
            sessions_item: "📱 {os}, {browser}\n📍 {ip} ({location})\n🕒 {active}",
            btn_terminate_all: "🚫 Terminate other sessions",
            terminated_all: "✅ All other sessions terminated."
        }
    }
};

module.exports = locales;
