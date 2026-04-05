export type Language = 'en' | 'pt' | 'am' | 'mg'

const translations = {
  en: {
    // Nav tabs
    home: 'Home',
    explore: 'Explore',
    messages: 'Messages',
    notifications: 'Notifications',
    profile: 'Profile',

    // Drawer
    settings: 'Settings',
    logout: 'Log Out',
    language: 'Language',

    // Feed / compose
    whatsHappening: "What's happening?",
    post: 'Post',
    cancel: 'Cancel',
    writeArticle: 'Write your article…',

    // Auth / onboarding
    joinContinue: 'Join & Continue',
    skip: 'Skip',
    joinOrganisations: 'Join organisations',
    joinOrgsSubtitle: 'Joining a global org automatically adds you to your campus chapter',
    noOrgsAvailable: 'No organisations available',
    selectUniversity: 'Select your university',
    universitySubtitle: "Select your university so we can connect you with your campus community.",
    myUniversityNotListed: "My university isn't listed",
    universityPlaceholder: 'Enter your university name',
    continueBtn: 'Continue',

    // Profile
    followers: 'Followers',
    following: 'Following',
    posts: 'Posts',
    editProfile: 'Edit Profile',
    follow: 'Follow',
    unfollow: 'Following',
    sendMessage: 'Message',

    // Post actions
    comment: 'Comment',
    repost: 'Repost',
    share: 'Share',
    report: 'Report',

    // Settings
    changePassword: 'Change Password',
    pushNotifications: 'Push Notifications',
    deleteAccount: 'Delete Account',
    dangerZone: 'Danger Zone',

    // Errors / empty states
    noPostsYet: 'No posts yet.',
    noFollowersYet: 'No followers yet.',
    noFollowingYet: 'Not following anyone yet.',
    somethingWentWrong: 'Something went wrong.',
    tryAgain: 'Try again',

    // Feed tabs
    feedGlobal: 'Global',
    feedCampus: 'Campus',
    feedOrg: 'Org',

    // Explore
    explorePeople: 'People',
    exploreOrgs: 'Orgs',
    searchPlaceholder: 'Search for people, posts, and orgs...',
    searchPrompt: 'Search for people, posts, and organisations',
    noResultsFound: 'No results found',

    // Notifications
    markAllRead: 'Mark all read',
    noNotificationsYet: 'No notifications yet',
    noNotificationsSubtitle: "When someone follows you or interacts with your posts, you'll see it here.",

    // Messages
    searchPeople: 'Search people...',
    noMessagesYet: 'No messages yet',
    startConversation: 'Search for someone above to start a conversation',
    noUsersFound: 'No users found',
    sayHello: 'No messages yet. Say hello!',
    messagePlaceholder: 'Message...',

    // Edit Profile
    save: 'Save',
    changePhoto: 'Change Photo',
    nameLabel: 'Name',
    bioLabel: 'Bio',

    // Org
    members: 'Members',
    chapters: 'Chapters',
    joinOrg: 'Join',
    leaveOrg: 'Leave',
    requestToJoin: 'Request',
    pendingMembership: 'Pending',
    noMembersYet: 'No members yet.',
    noChaptersYet: 'No chapters yet.',

    // Post Detail
    writeReply: 'Write a reply…',
    replyingTo: 'Replying to',

    // Admin
    noPendingReports: 'No pending reports',
    allReviewedSubtitle: 'All reports have been reviewed. Check back later.',
    approve: 'Approve',
    removeContent: 'Remove',
  },
  pt: {
    // Nav tabs
    home: 'Início',
    explore: 'Explorar',
    messages: 'Mensagens',
    notifications: 'Notificações',
    profile: 'Perfil',

    // Drawer
    settings: 'Configurações',
    logout: 'Sair',
    language: 'Idioma',

    // Feed / compose
    whatsHappening: 'O que está acontecendo?',
    post: 'Publicar',
    cancel: 'Cancelar',
    writeArticle: 'Escreva seu artigo…',

    // Auth / onboarding
    joinContinue: 'Entrar & Continuar',
    skip: 'Pular',
    joinOrganisations: 'Entrar em organizações',
    joinOrgsSubtitle: 'Entrar em uma org global adiciona você automaticamente ao seu capítulo do campus',
    noOrgsAvailable: 'Nenhuma organização disponível',
    selectUniversity: 'Selecione sua universidade',
    universitySubtitle: 'Selecione sua universidade para nos conectarmos com sua comunidade do campus.',
    myUniversityNotListed: 'Minha universidade não está listada',
    universityPlaceholder: 'Digite o nome da sua universidade',
    continueBtn: 'Continuar',

    // Profile
    followers: 'Seguidores',
    following: 'Seguindo',
    posts: 'Publicações',
    editProfile: 'Editar Perfil',
    follow: 'Seguir',
    unfollow: 'Seguindo',
    sendMessage: 'Mensagem',

    // Post actions
    comment: 'Comentar',
    repost: 'Repostar',
    share: 'Compartilhar',
    report: 'Denunciar',

    // Settings
    changePassword: 'Alterar Senha',
    pushNotifications: 'Notificações Push',
    deleteAccount: 'Excluir Conta',
    dangerZone: 'Zona de Perigo',

    // Errors / empty states
    noPostsYet: 'Nenhuma publicação ainda.',
    noFollowersYet: 'Nenhum seguidor ainda.',
    noFollowingYet: 'Não segue ninguém ainda.',
    somethingWentWrong: 'Algo deu errado.',
    tryAgain: 'Tentar novamente',

    // Feed tabs
    feedGlobal: 'Global',
    feedCampus: 'Campus',
    feedOrg: 'Org',

    // Explore
    explorePeople: 'Pessoas',
    exploreOrgs: 'Orgs',
    searchPlaceholder: 'Buscar pessoas, publicações e orgs...',
    searchPrompt: 'Buscar pessoas, publicações e organizações',
    noResultsFound: 'Nenhum resultado encontrado',

    // Notifications
    markAllRead: 'Marcar tudo como lido',
    noNotificationsYet: 'Nenhuma notificação ainda',
    noNotificationsSubtitle: 'Quando alguém te seguir ou interagir com suas publicações, você verá aqui.',

    // Messages
    searchPeople: 'Buscar pessoas...',
    noMessagesYet: 'Nenhuma mensagem ainda',
    startConversation: 'Busque alguém acima para iniciar uma conversa',
    noUsersFound: 'Nenhum usuário encontrado',
    sayHello: 'Nenhuma mensagem ainda. Diga olá!',
    messagePlaceholder: 'Mensagem...',

    // Edit Profile
    save: 'Salvar',
    changePhoto: 'Alterar Foto',
    nameLabel: 'Nome',
    bioLabel: 'Biografia',

    // Org
    members: 'Membros',
    chapters: 'Capítulos',
    joinOrg: 'Entrar',
    leaveOrg: 'Sair',
    requestToJoin: 'Solicitar',
    pendingMembership: 'Pendente',
    noMembersYet: 'Nenhum membro ainda.',
    noChaptersYet: 'Nenhum capítulo ainda.',

    // Post Detail
    writeReply: 'Escreva uma resposta…',
    replyingTo: 'Respondendo a',

    // Admin
    noPendingReports: 'Nenhum relatório pendente',
    allReviewedSubtitle: 'Todos os relatórios foram revisados. Volte mais tarde.',
    approve: 'Aprovar',
    removeContent: 'Remover',
  },
  am: {
    // Nav tabs
    home: 'ቤት',
    explore: 'ፈልግ',
    messages: 'መልዕክቶች',
    notifications: 'ማሳወቂያዎች',
    profile: 'መገለጫ',

    // Drawer
    settings: 'ቅንብሮች',
    logout: 'ውጣ',
    language: 'ቋንቋ',

    // Feed / compose
    whatsHappening: 'ምን እየሆነ ነው?',
    post: 'ለጥፍ',
    cancel: 'ሰርዝ',
    writeArticle: 'ጽሑፍዎን ይፃፉ…',

    // Auth / onboarding
    joinContinue: 'ይቀላቀሉ & ይቀጥሉ',
    skip: 'ዝለል',
    joinOrganisations: 'ድርጅቶችን ይቀላቀሉ',
    joinOrgsSubtitle: 'ዓለም አቀፍ ድርጅትን መቀላቀል ወደ ካምፓስ ምዕራፍዎ አስቀድሞ ይጨምርዎታል',
    noOrgsAvailable: 'ምንም ድርጅት የለም',
    selectUniversity: 'ዩኒቨርሲቲዎን ይምረጡ',
    universitySubtitle: 'ከካምፓስ ማህበረሰብዎ ጋር ለማገናኘት ዩኒቨርሲቲዎን ይምረጡ።',
    myUniversityNotListed: 'ዩኒቨርሲቲዬ አልተዘረዘረም',
    universityPlaceholder: 'የዩኒቨርሲቲዎን ስም ያስገቡ',
    continueBtn: 'ቀጥል',

    // Profile
    followers: 'ተከታዮች',
    following: 'እየተከተሉ',
    posts: 'ልጥፎች',
    editProfile: 'መገለጫ አርትዕ',
    follow: 'ተከተል',
    unfollow: 'እየተከተሉ',
    sendMessage: 'መልዕክት',

    // Post actions
    comment: 'አስተያየት',
    repost: 'እንደገና ለጥፍ',
    share: 'አጋራ',
    report: 'ሪፖርት',

    // Settings
    changePassword: 'የይለፍቃልን ቀይር',
    pushNotifications: 'የፑሽ ማሳወቂያዎች',
    deleteAccount: 'መለያ ሰርዝ',
    dangerZone: 'አደገኛ ቦታ',

    // Errors / empty states
    noPostsYet: 'እስካሁን ምንም ልጥፍ የለም።',
    noFollowersYet: 'እስካሁን ምንም ተከታይ የለም።',
    noFollowingYet: 'እስካሁን ማንንም አይከተሉም።',
    somethingWentWrong: 'ችግር ተፈጥሯል።',
    tryAgain: 'እንደገና ሞክር',

    // Feed tabs
    feedGlobal: 'አለምአቀፍ',
    feedCampus: 'ካምፓስ',
    feedOrg: 'ድርጅት',

    // Explore
    explorePeople: 'ሰዎች',
    exploreOrgs: 'ድርጅቶች',
    searchPlaceholder: 'ሰዎችን፣ ልጥፎችን እና ድርጅቶችን ፈልግ...',
    searchPrompt: 'ሰዎችን፣ ልጥፎችን እና ድርጅቶችን ፈልግ',
    noResultsFound: 'ምንም ውጤት አልተገኘም',

    // Notifications
    markAllRead: 'ሁሉንም እንደተነበበ ምልክት አድርግ',
    noNotificationsYet: 'እስካሁን ምንም ማሳወቂያ የለም',
    noNotificationsSubtitle: 'አንድ ሰው ሲከተልዎ ወይም ከልጥፎችዎ ጋር ሲቃረብ እዚህ ያዩታል።',

    // Messages
    searchPeople: 'ሰዎችን ፈልግ...',
    noMessagesYet: 'እስካሁን ምንም መልዕክት የለም',
    startConversation: 'ውይይት ለመጀመር ከላይ አንድን ሰው ፈልጉ',
    noUsersFound: 'ምንም ተጠቃሚ አልተገኘም',
    sayHello: 'እስካሁን ምንም መልዕክት የለም። ሰላም በሉ!',
    messagePlaceholder: 'መልዕክት...',

    // Edit Profile
    save: 'አስቀምጥ',
    changePhoto: 'ፎቶ ቀይር',
    nameLabel: 'ስም',
    bioLabel: 'ታሪክ',

    // Org
    members: 'አባላት',
    chapters: 'ምዕራፎች',
    joinOrg: 'ተቀላቀል',
    leaveOrg: 'ውጣ',
    requestToJoin: 'ጥያቄ',
    pendingMembership: 'በመጠባበቅ ላይ',
    noMembersYet: 'እስካሁን ምንም አባል የለም።',
    noChaptersYet: 'እስካሁን ምንም ምዕራፍ የለም።',

    // Post Detail
    writeReply: 'መልስ ጻፍ…',
    replyingTo: 'ምላሽ ለ',

    // Admin
    noPendingReports: 'ምንም አቤቱታ አልተቀረ',
    allReviewedSubtitle: 'ሁሉም አቤቱታዎች ተጣርተዋል። ቆይቶ ተመለስ።',
    approve: 'ፍቀድ',
    removeContent: 'አስወግድ',
  },
  mg: {
    // Nav tabs
    home: 'Fandraisana',
    explore: 'Hitady',
    messages: 'Hafatra',
    notifications: 'Fampandrenesana',
    profile: 'Mombamomba',

    // Drawer
    settings: 'Fikirana',
    logout: 'Hiala',
    language: 'Fiteny',

    // Feed / compose
    whatsHappening: 'Inona no mitranga?',
    post: 'Mandefitra',
    cancel: 'Hanafoana',
    writeArticle: 'Soraty ny lahatsoratra…',

    // Auth / onboarding
    joinContinue: 'Hiditra & Handroso',
    skip: 'Hanohy',
    joinOrganisations: 'Hiditra amin\'ny fikambanana',
    joinOrgsSubtitle: 'Ny fidirana amin\'ny org maneran-tany dia manampy anao ho ao amin\'ny sampana campus',
    noOrgsAvailable: 'Tsy misy fikambanana',
    selectUniversity: 'Safidio ny oniversiterao',
    universitySubtitle: 'Safidio ny oniversiterao mba hifandraisantsika amin\'ny fiarahamonina campus\'areo.',
    myUniversityNotListed: 'Tsy voasoratra ny oniversiteko',
    universityPlaceholder: 'Ampidiro ny anaran\'ny oniversiterao',
    continueBtn: 'Mitohy',

    // Profile
    followers: 'Mpanaraka',
    following: 'Manaraka',
    posts: 'Fandefitrana',
    editProfile: 'Hanova mombamomba',
    follow: 'Manaraka',
    unfollow: 'Manaraka',
    sendMessage: 'Hafatra',

    // Post actions
    comment: 'Fanamarihana',
    repost: 'Mandefitra indray',
    share: 'Mizara',
    report: 'Mitady',

    // Settings
    changePassword: 'Hanova tenimiafina',
    pushNotifications: 'Fampandrenesana Push',
    deleteAccount: 'Hamafa kaonty',
    dangerZone: 'Faritra mampidi-doza',

    // Errors / empty states
    noPostsYet: 'Mbola tsy misy fandefitrana.',
    noFollowersYet: 'Mbola tsy misy mpanaraka.',
    noFollowingYet: 'Tsy manaraka olona mbola.',
    somethingWentWrong: 'Nisy olana nitranga.',
    tryAgain: 'Andramo indray',

    // Feed tabs
    feedGlobal: 'Maneran-tany',
    feedCampus: 'Campus',
    feedOrg: 'Fikambanana',

    // Explore
    explorePeople: 'Olona',
    exploreOrgs: 'Fikambanana',
    searchPlaceholder: 'Hikaroka olona, fandefitrana, fikambanana...',
    searchPrompt: 'Hikaroka olona, fandefitrana ary fikambanana',
    noResultsFound: 'Tsy misy valiny hita',

    // Notifications
    markAllRead: 'Marika ho voavoatra rehetra',
    noNotificationsYet: 'Mbola tsy misy fampandrenesana',
    noNotificationsSubtitle: 'Rehefa misy manaraka anao na mifandray amin\'ny fandefitranao dia hiseho eto.',

    // Messages
    searchPeople: 'Hikaroka olona...',
    noMessagesYet: 'Mbola tsy misy hafatra',
    startConversation: 'Karioka olona eo ambony hanomboka resaka',
    noUsersFound: 'Tsy misy mpampiasa hita',
    sayHello: 'Mbola tsy misy hafatra. Miarahaba!',
    messagePlaceholder: 'Hafatra...',

    // Edit Profile
    save: 'Tehiry',
    changePhoto: 'Hanova sary',
    nameLabel: 'Anarana',
    bioLabel: 'Momba ahy',

    // Org
    members: 'Mpikambana',
    chapters: 'Sampana',
    joinOrg: 'Hiditra',
    leaveOrg: 'Hiala',
    requestToJoin: 'Hangataka',
    pendingMembership: 'Miandry',
    noMembersYet: 'Mbola tsy misy mpikambana.',
    noChaptersYet: 'Mbola tsy misy sampana.',

    // Post Detail
    writeReply: 'Soraty valiny…',
    replyingTo: 'Mamaly',

    // Admin
    noPendingReports: 'Tsy misy tatitra miandry',
    allReviewedSubtitle: 'Voavaly ny tatitra rehetra. Jereo indray rahateo.',
    approve: 'Mankasitraka',
    removeContent: 'Esorina',
  },
} as const

export type TranslationKey = keyof typeof translations.en

export default translations
