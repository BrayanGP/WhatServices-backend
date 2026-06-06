// Contenido de los documentos legales de WhatServices (texto fuente para generar los PDF).
// Plataforma intermediaria de servicios del hogar vía WhatsApp, operada en México.

const VERSION = '1.0';
const EFFECTIVE_DATE = '6 de junio de 2026';
const CONTACT_EMAIL = 'contacto@whatservice.org';
const SITE = 'https://whatservice.org';

const terms = {
  title: 'Términos y Condiciones de Uso de WhatServices',
  sections: [
    {
      h: '1. Definiciones',
      p: [
        '"WhatServices", "la Plataforma" o "nosotros": el sitio web ' + SITE + ' y los servicios tecnológicos que ponen en contacto a Clientes con Proveedores de servicios del hogar a través de WhatsApp.',
        '"Proveedor": persona física o moral que se registra para ofrecer y prestar servicios del hogar a los Clientes.',
        '"Cliente" o "Usuario": persona que utiliza la Plataforma para buscar, contactar o contratar a un Proveedor.',
        '"Servicios del hogar": trabajos como plomería, electricidad, limpieza, jardinería, carpintería y similares que el Proveedor presta directamente al Cliente.',
        '"WhatsApp": el servicio de mensajería de terceros utilizado para la verificación de cuentas y la comunicación entre las partes.',
      ],
    },
    {
      h: '2. Objeto y naturaleza del servicio',
      p: [
        'WhatServices es un marketplace local que funciona exclusivamente como INTERMEDIARIO tecnológico: facilita el descubrimiento y el contacto entre Clientes y Proveedores de servicios del hogar.',
        'WhatServices NO presta, ejecuta, supervisa ni garantiza los servicios del hogar ofrecidos por los Proveedores. La relación de prestación del servicio se celebra directa y exclusivamente entre el Cliente y el Proveedor.',
        'WhatServices no es empleador, socio, representante ni mandatario de los Proveedores, y no asume responsabilidad por la calidad, seguridad, legalidad, puntualidad o resultado de los servicios contratados entre las partes.',
      ],
    },
    {
      h: '3. Registro y cuenta',
      p: [
        'Para registrarse, el usuario debe proporcionar datos veraces, completos y actualizados, y verificar su número de teléfono mediante un código (OTP) enviado por WhatsApp.',
        'El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso y de toda actividad realizada desde su cuenta.',
        'WhatServices podrá suspender o cancelar cuentas con información falsa, duplicada o que infrinja estos Términos.',
      ],
    },
    {
      h: '4. Obligaciones del Proveedor',
      p: [
        'Proporcionar información real y verificable sobre su identidad, su negocio, sus especialidades y su área de cobertura.',
        'Prestar los servicios con diligencia, calidad y profesionalismo, y atender los acuerdos pactados con el Cliente.',
        'Cumplir por su cuenta con todas las obligaciones legales, laborales, de seguridad y fiscales que deriven de su actividad, incluyendo la emisión de comprobantes cuando corresponda.',
        'No utilizar la Plataforma para fines fraudulentos, ilícitos o ajenos a la prestación de servicios del hogar.',
      ],
    },
    {
      h: '5. Obligaciones del Cliente',
      p: [
        'Proporcionar información veraz para la localización y contratación del servicio.',
        'Tratar a los Proveedores con respeto y cubrir los pagos acordados por los servicios efectivamente recibidos.',
        'Utilizar la Plataforma de buena fe y abstenerse de publicar reseñas falsas o difamatorias.',
      ],
    },
    {
      h: '6. Uso de WhatsApp y consentimiento de mensajes',
      p: [
        'Al registrarse y utilizar la Plataforma, el usuario consiente recibir mensajes por WhatsApp relacionados con la verificación de su cuenta, la coordinación de servicios y notificaciones operativas.',
        'El uso de WhatsApp se rige además por los términos y políticas del proveedor de dicho servicio. El usuario puede solicitar dejar de recibir comunicaciones no esenciales en cualquier momento.',
      ],
    },
    {
      h: '7. Calificaciones y reseñas',
      p: [
        'Los Clientes pueden calificar y reseñar a los Proveedores con base en su experiencia real.',
        'WhatServices podrá moderar, ocultar o eliminar contenido que sea falso, ofensivo, ilegal o que viole estos Términos, sin que ello implique aval del contenido publicado por los usuarios.',
      ],
    },
    {
      h: '8. Pagos, suscripciones y facturación',
      p: [
        'El acceso a determinadas funciones para Proveedores puede requerir una suscripción de pago procesada a través de Stripe. Al contratar, el usuario acepta los términos del procesador de pagos.',
        'Las suscripciones pueden renovarse de forma periódica hasta su cancelación. La facturación, los importes y la periodicidad se informan al momento de la contratación.',
        'WhatServices no almacena datos completos de tarjetas; el cobro lo procesa Stripe conforme a sus propios estándares de seguridad.',
      ],
    },
    {
      h: '9. Limitación de responsabilidad',
      p: [
        'Dado su carácter de intermediario, WhatServices no será responsable por daños, perjuicios, incumplimientos, defectos o controversias derivados de los servicios prestados entre Clientes y Proveedores.',
        'La Plataforma se ofrece "tal cual" y "según disponibilidad". En la máxima medida permitida por la ley, WhatServices no garantiza la ausencia de errores ni la disponibilidad ininterrumpida del servicio.',
      ],
    },
    {
      h: '10. Propiedad intelectual',
      p: [
        'La marca, el logotipo, el software, el diseño y los contenidos de la Plataforma son propiedad de WhatServices o de sus licenciantes y están protegidos por la legislación aplicable.',
        'Queda prohibida su reproducción, distribución o uso no autorizado. El usuario conserva los derechos sobre el contenido que él publica, otorgando a WhatServices una licencia para mostrarlo dentro de la Plataforma.',
      ],
    },
    {
      h: '11. Remisión al Aviso de Privacidad',
      p: [
        'El tratamiento de los datos personales se rige por el Aviso de Privacidad de WhatServices, que forma parte integral de estos Términos y está disponible en la Plataforma.',
      ],
    },
    {
      h: '12. Modificaciones',
      p: [
        'WhatServices podrá modificar estos Términos en cualquier momento. Los cambios se publicarán en la Plataforma indicando la versión y la fecha de vigencia. El uso continuado tras la publicación implica su aceptación.',
      ],
    },
    {
      h: '13. Vigencia, suspensión y cancelación',
      p: [
        'Estos Términos rigen mientras el usuario utilice la Plataforma. El usuario puede cancelar su cuenta cuando lo desee.',
        'WhatServices podrá suspender o cancelar el acceso de un usuario que incumpla estos Términos o realice un uso indebido de la Plataforma.',
      ],
    },
    {
      h: '14. Ley aplicable y jurisdicción',
      p: [
        'Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales competentes en México, renunciando a cualquier otro fuero que pudiera corresponderles.',
      ],
    },
    {
      h: '15. Contacto',
      p: [
        'Para dudas o aclaraciones sobre estos Términos y Condiciones, escribe a ' + CONTACT_EMAIL + '.',
      ],
    },
  ],
};

const privacy = {
  title: 'Aviso de Privacidad de WhatServices',
  sections: [
    {
      h: '1. Identidad y domicilio del responsable',
      p: [
        'WhatServices (en adelante, "el Responsable"), operador del sitio ' + SITE + ', es responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), su Reglamento y los Lineamientos aplicables en México.',
        'Para asuntos relacionados con tus datos personales puedes contactarnos en ' + CONTACT_EMAIL + '.',
      ],
    },
    {
      h: '2. Datos personales que se recaban',
      p: [
        'Podemos recabar: nombre, número de teléfono, correo electrónico, ubicación o código postal, y datos del negocio del Proveedor (nombre comercial, especialidades, descripción y área de servicio).',
        'En el caso de Proveedores, también podemos recabar fotografías de trabajos realizados y de perfil que el propio usuario decide cargar.',
        'No recabamos datos personales sensibles. No solicitamos datos financieros completos: los pagos se procesan directamente a través de Stripe.',
      ],
    },
    {
      h: '3. Finalidades del tratamiento',
      p: [
        'Finalidades primarias (necesarias para el servicio): registro y autenticación de la cuenta; verificación del número de teléfono por WhatsApp; intermediación y contacto entre Clientes y Proveedores; coordinación y notificaciones operativas del servicio; gestión de calificaciones y reseñas; y procesamiento de suscripciones.',
        'Finalidades secundarias (no necesarias): mejora de la Plataforma, estadísticas, encuestas y comunicaciones de marketing o promociones. Puedes oponerte a estas finalidades secundarias escribiendo a ' + CONTACT_EMAIL + ' sin que ello afecte el uso del servicio.',
      ],
    },
    {
      h: '4. Transferencias y encargados',
      p: [
        'Para concretar el servicio, compartimos los datos de contacto necesarios entre Clientes y Proveedores involucrados en una solicitud.',
        'Asimismo, utilizamos proveedores tecnológicos que actúan como encargados: servicios de hosting e infraestructura, el servicio de mensajería WhatsApp para la comunicación, y Stripe para el procesamiento de pagos.',
        'Salvo lo anterior y los casos previstos por la ley, no transferimos tus datos a terceros sin tu consentimiento.',
      ],
    },
    {
      h: '5. Derechos ARCO y su ejercicio',
      p: [
        'Tienes derecho a Acceder, Rectificar, Cancelar u Oponerte (derechos ARCO) al tratamiento de tus datos personales.',
        'Para ejercerlos, envía tu solicitud a ' + CONTACT_EMAIL + ' indicando tu nombre, los datos involucrados y el derecho que deseas ejercer. Responderemos en los plazos que marca la LFPDPPP.',
      ],
    },
    {
      h: '6. Revocación del consentimiento',
      p: [
        'Puedes revocar en cualquier momento el consentimiento otorgado para el tratamiento de tus datos, en la medida en que la ley lo permita, escribiendo a ' + CONTACT_EMAIL + '. La revocación puede implicar que no podamos seguir prestándote el servicio.',
      ],
    },
    {
      h: '7. Cookies y tecnologías de rastreo',
      p: [
        'El sitio puede utilizar cookies y tecnologías similares para recordar tu sesión, medir el uso y mejorar la experiencia. Puedes deshabilitar las cookies desde la configuración de tu navegador, considerando que algunas funciones podrían dejar de operar correctamente.',
      ],
    },
    {
      h: '8. Cambios al Aviso de Privacidad',
      p: [
        'Este Aviso puede actualizarse para reflejar cambios legales o en nuestras prácticas. La versión vigente se publicará en la Plataforma indicando su versión y fecha.',
      ],
    },
    {
      h: '9. Consentimiento',
      p: [
        'Al registrarte y utilizar WhatServices manifiestas que has leído y comprendido este Aviso de Privacidad y otorgas tu consentimiento para el tratamiento de tus datos personales conforme a las finalidades aquí descritas.',
      ],
    },
  ],
};

module.exports = { VERSION, EFFECTIVE_DATE, CONTACT_EMAIL, SITE, terms, privacy };
