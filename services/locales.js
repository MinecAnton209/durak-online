const locales = {
    uk: {
        welcome: "Привіт, {name}! 👋\n\nЦе легендарна гра \"Дурень Онлайн\".\nТисни кнопку нижче, щоб почати!",
        play_btn: "🃏 Грати в Дурака",
        add_group_btn: "👥 Додати в групу",
        help: "Просто напиши @{botname} в будь-якому чаті, щоб запросити друзів!\n\nКоманди:\n/profile - Мій профіль\n/createroom - Створити кімнату\n/donate - Підтримати проект",

        btn_friends: "👥 Друзі",
        btn_leaderboard: "🏆 Топ гравців",
        btn_donate: "✨ Пожертвувати (Stars)",

        buttons: {
            cancel: "🔙 Скасувати",
            back_to_menu: "⬅️ Головне меню"
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
            lobby_join_button: "🚀 Увійти в лобі"
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
            user_not_found: "❌ Користувача не знайдено."
        }
    },

    ru: {
        welcome: "Привет, {name}! 👋\n\nЭто легендарная игра \"Дурак Онлайн\".\nЖми кнопку ниже, чтобы начать!",
        play_btn: "🃏 Играть в Дурака",
        add_group_btn: "👥 Добавить в группу",
        help: "Просто напиши @{botname} в любом чате, чтобы пригласить друзей!\n\nКоманды:\n/profile - Мой профиль\n/createroom - Создать комнату\n/donate - Поддержать проект",

        btn_friends: "👥 Друзья",
        btn_leaderboard: "🏆 Топ игроков",
        btn_donate: "✨ Пожертвовать (Stars)",

        buttons: {
            cancel: "🔙 Отмена",
            back_to_menu: "⬅️ Главное меню"
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
            lobby_join_button: "🚀 Войти в лобби"
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
            user_not_found: "❌ Пользователь не найден."
        }
    },

    en: {
        welcome: "Hello, {name}! 👋\n\nThis is the legendary \"Durak Online\".\nPress the button below to start!",
        play_btn: "🃏 Play Durak",
        add_group_btn: "👥 Add to Group",
        help: "Just type @{botname} in any chat to invite friends!\n\nCommands:\n/profile - My Profile\n/createroom - Create Room\n/donate - Support Project",

        btn_friends: "👥 Friends",
        btn_leaderboard: "🏆 Leaderboard",
        btn_donate: "✨ Donate (Stars)",

        buttons: {
            cancel: "🔙 Cancel",
            back_to_menu: "⬅️ Main Menu"
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
            lobby_join_button: "🚀 Join Lobby"
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
            user_not_found: "❌ User not found."
        }
    }
};

module.exports = locales;